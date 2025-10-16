"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import { Plus, MessageSquare, Trash2 } from "lucide-react";

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [sceneImages, setSceneImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUser() {
      const supabase = getBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Sync user to local database
        try {
          await fetch("/api/user/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ supabaseUser: user }),
          });
        } catch (err) {
          console.error("Failed to sync user:", err);
        }
        
        setUserId(user.id);
        await loadChats(user.id);
      } else {
        setError("Please sign in to use this feature");
      }
    }
    fetchUser();
  }, []);

  async function loadChats(uid: string) {
    try {
      const res = await fetch(`/api/chats?userId=${uid}`);
      const { chats } = await res.json();
      setChats(chats || []);
      if (chats && chats.length > 0) {
        setCurrentChatId(chats[0].id);
      } else {
        const newChatRes = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid, title: "New Chat" }),
        });
        const { chat } = await newChatRes.json();
        setChats([chat]);
        setCurrentChatId(chat.id);
      }
    } catch (err) {
      console.error("Failed to load chats:", err);
    }
  }

  async function createNewChat() {
    if (!userId) return;
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, title: "New Chat" }),
        
      });
      const { chat } = await res.json();
      setChats([chat, ...chats]);
      setCurrentChatId(chat.id);
      setSceneImages([]);
      setPrompt("");
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  }

  async function deleteChat(chatId: string) {
    try {
      await fetch(`/api/chats?chatId=${chatId}`, { method: "DELETE" });
      const newChats = chats.filter((c) => c.id !== chatId);
      setChats(newChats);
      if (currentChatId === chatId) {
        setCurrentChatId(newChats[0]?.id || null);
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  }

  async function handleGenerate() {
    if (!userId || !currentChatId) {
      setError("Please create a chat first");
      return;
    }

    if (!currentChatId) {
      await createNewChat();
      return;
    }

    if (sceneImages.length > 0) {
      setError("Only one prompt allowed per chat. Create a new chat to generate more.");
      return;
    }

    setError(null);
    setSceneImages([]);
    setLoading(true);

    try {
      // 1️⃣ Generate Character
      const charRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mode: "character",
          userId,
          chatId: currentChatId,
        }),
      });

      if (!charRes.ok) {
        const errorData = await charRes.json().catch(() => ({ error: "Character generation failed" }));
        throw new Error(errorData.error || "Character generation failed");
      }
      const charResponse = await charRes.json();
      const charData = charResponse.data;

      if (!charData?.image_prompt) {
        throw new Error("Invalid character data received");
      }

      // 2️⃣ Generate Character Image
      const imgRes = await fetch("/api/genImage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: charData.image_prompt,
          type: "character",
          recordId: charData.id,
          userId,
          metadata: { chatId: currentChatId },
        }),
      });

      if (!imgRes.ok) {
        const errorData = await imgRes.json().catch(() => ({ error: "Character image generation failed" }));
        throw new Error(errorData.error || "Character image generation failed");
      }
      const { imageUrl: characterImageUrl } = await imgRes.json();

      console.log("Character created:", charData.name, "→", characterImageUrl);

      // 3️⃣ Generate 3 Scenes
      const sceneRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${prompt}\nCharacter: ${charData.name}\nDescription: ${charData.image_prompt}`,
          mode: "scenes",
          userId,
          chatId: currentChatId,
        }),
      });

      if (!sceneRes.ok) {
        const errorData = await sceneRes.json().catch(() => ({ error: "Scene generation failed" }));
        throw new Error(errorData.error || "Scene generation failed");
      }
      const sceneResponse = await sceneRes.json();
      const scenes = sceneResponse.data;
      if (!Array.isArray(scenes) || scenes.length !== 3)
        throw new Error("Scene data malformed");

      // 4️⃣ Generate Scene Images in Parallel
      const sceneImages = await Promise.all(
        scenes.map(async (scene, index) => {
          const img = await fetch("/api/genImage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: scene.scene_image_prompt,
              type: "scene",
              recordId: scene.id,
              userId,
              metadata: { chatId: currentChatId },
            }),
          });

          if (!img.ok) {
            const errorData = await img.json().catch(() => ({ error: `Scene ${index + 1} image failed` }));
            throw new Error(errorData.error || `Scene ${index + 1} image failed`);
          }
          const { imageUrl } = await img.json();
          return imageUrl;
        })
      );

      // 5️⃣ Display Scene Images
      setSceneImages(sceneImages);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4">
          <button
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition"
          >
            <Plus className="w-5 h-5" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-800 transition ${
                currentChatId === chat.id ? "bg-gray-800" : ""
              }`}
              onClick={() => setCurrentChatId(chat.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm truncate">{chat.title}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(chat.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-semibold mb-4 text-center">
              Cinematic Scene Generator
            </h1>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your story idea..."
              className="w-full p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black min-h-[100px]"
            />

            <div className="flex justify-center mt-4">
              <button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim() || !currentChatId}
                className="px-6 py-2 bg-black text-white rounded-lg disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate"}
              </button>
            </div>

            {error && (
              <p className="text-red-600 text-center mt-4 font-medium">{error}</p>
            )}

            {/* Scene Images */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-8">
              {sceneImages.map((src, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-xl overflow-hidden shadow-md"
                >
                  <Image
                    src={src}
                    alt={`Scene ${i + 1}`}
                    fill
                    className="object-cover"
                  />
                  <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                    Scene {i + 1}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
