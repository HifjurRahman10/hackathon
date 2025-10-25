"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import { Plus, MessageSquare, Trash2, Video } from "lucide-react";

interface Chat {
  id: string;
  title: string;
  created_at: string;
}

interface SceneData {
  imageUrl: string;
  videoUrl?: string;
  sceneId?: string;
  videoPrompt?: string;
}

interface SceneAPIData {
  id: string;
  scene_image_prompt: string;
  scene_video_prompt: string;
}

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [scenes, setScenes] = useState<SceneData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [stitchedVideoUrl, setStitchedVideoUrl] = useState<string | null>(null);

  // ✅ Load Supabase user and chats
  useEffect(() => {
    async function fetchUser() {
      const supabase = getBrowserSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Please sign in to use this feature");
        return;
      }

      setUserId(user.id);
      await loadChats(user.id);
    }

    fetchUser();
  }, []);

  // ✅ Load user's chats
  async function loadChats(uid: string) {
    try {
      const res = await fetch(`/api/chats?userId=${uid}`);
      const data = await res.json();
      const chatList: Chat[] = data.chats || [];

      setChats(chatList);
      if (chatList.length > 0) {
        setCurrentChatId(chatList[0].id);
        await loadFinalVideo(chatList[0].id);
      } else {
        const newChatRes = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid, title: "New Chat" }),
        });
        const { chat } = await newChatRes.json();
        setChats([chat]);
        setCurrentChatId(chat.id);
        setStitchedVideoUrl(null);
      }
    } catch (err) {
      console.error("Failed to load chats:", err);
    }
  }

  // ✅ Load final stitched video from Supabase
  async function loadFinalVideo(chatId: string) {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase
      .from("final_video")
      .select("video_url")
      .eq("chat_id", chatId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (!error && data?.video_url) {
      setStitchedVideoUrl(data.video_url);
    } else {
      setStitchedVideoUrl(null);
    }
  }

  // ✅ Create new chat
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
      setScenes([]);
      setStitchedVideoUrl(null);
      setPrompt("");
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  }

  // ✅ Delete chat
  async function deleteChat(chatId: string) {
    try {
      await fetch(`/api/chats?chatId=${chatId}`, { method: "DELETE" });
      const newChats = chats.filter((c) => c.id !== chatId);
      setChats(newChats);
      if (currentChatId === chatId) {
        const nextChat = newChats[0];
        setCurrentChatId(nextChat?.id || null);
        if (nextChat) await loadFinalVideo(nextChat.id);
        else setStitchedVideoUrl(null);
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  }

  // ✅ Main generation pipeline — parallelized + one-prompt rule
  async function handleGenerate() {
    if (!userId || !currentChatId) {
      setError("Please create a chat first");
      return;
    }

    // 🚫 Enforce one prompt per chat
    const supabase = getBrowserSupabase();
    const { data: existingScenes } = await supabase
      .from("scenes")
      .select("id")
      .eq("chat_id", currentChatId)
      .limit(1);

    if (existingScenes && existingScenes.length > 0) {
      setError("Only one prompt allowed per chat. Create a new chat to generate more.");
      return;
    }

    setError(null);
    setScenes([]);
    setStitchedVideoUrl(null);
    setProgress(0);
    setLoading(true);

    try {
      // 1️⃣ Generate character
      setProgress(10);
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

      if (!charRes.ok) throw new Error("Character generation failed");
      const { data: charData } = await charRes.json();

      if (!charData?.image_prompt) throw new Error("Invalid character data");

      // 2️⃣ Character image
      setProgress(25);
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
      if (!imgRes.ok) throw new Error("Character image generation failed");
      const { imageUrl: characterImageUrl } = await imgRes.json();

      // 3️⃣ Generate scenes
      setProgress(40);
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
      if (!sceneRes.ok) throw new Error("Scene generation failed");
      const { data: scenesData } = await sceneRes.json();
      if (!Array.isArray(scenesData) || scenesData.length < 1)
        throw new Error("Scene data malformed");

      // 4️⃣ Generate scene images + videos in parallel
      setProgress(55);
      const sceneTasks = scenesData.map(async (scene: SceneAPIData) => {
        const imgPromise = fetch("/api/genImage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: scene.scene_image_prompt,
            type: "scene",
            recordId: scene.id,
            userId,
            metadata: { chatId: currentChatId },
          }),
        }).then(async (r) => {
          if (!r.ok) throw new Error("Scene image failed");
          const { imageUrl } = await r.json();
          return imageUrl as string;
        });

        const vidPromise = imgPromise.then(async (imageUrl) => {
          const videoRes = await fetch("/api/genVideo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: scene.scene_video_prompt,
              imageUrl,
              sceneId: scene.id,
              userId,
              metadata: { chatId: currentChatId },
            }),
          });
          if (!videoRes.ok) throw new Error("Video generation failed");
          const { videoUrl } = await videoRes.json();
          return { imageUrl, videoUrl };
        });

        return vidPromise;
      });

      const results = await Promise.all(sceneTasks);
      setProgress(85);

      const mappedScenes = results.map((r) => ({
        imageUrl: r.imageUrl,
        videoUrl: r.videoUrl,
      }));
      setScenes(mappedScenes);

      // 5️⃣ Stitch final video
      setProgress(95);
      const videoUrls = mappedScenes.map((s) => s.videoUrl!).filter(Boolean);
      const stitchRes = await fetch("/api/stitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoUrls, chatId: currentChatId, userId }),
      });

      if (!stitchRes.ok) throw new Error("Video stitching failed");
      const { videoUrl } = await stitchRes.json();

      setProgress(100);
      setStitchedVideoUrl(videoUrl);
    } catch (err: any) {
      console.error("Error:", err);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  // ✅ Render
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
              onClick={() => {
                setCurrentChatId(chat.id);
                loadFinalVideo(chat.id);
              }}
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

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-10">
            <div className="w-32 h-32 rounded-full border-4 border-gray-300 flex items-center justify-center text-2xl font-bold text-gray-800">
              {progress}%
            </div>
          </div>
        )}

        <div className="w-full max-w-3xl">
          <h1 className="text-2xl font-semibold mb-4 text-center">
            Cinematic Scene Generator
          </h1>

          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Enter your story idea..."
            className="w-full p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black min-h-[100px]"
            disabled={loading}
          />

          <div className="flex justify-center mt-4">
            <button
              onClick={handleGenerate}
              disabled={loading || !prompt.trim() || !currentChatId}
              className="px-6 py-2 bg-black text-white rounded-lg disabled:opacity-50 hover:bg-gray-800 transition"
            >
              {loading ? "Generating..." : "Generate"}
            </button>
          </div>

          {error && <p className="text-red-600 text-center mt-4 font-medium">{error}</p>}

          {stitchedVideoUrl && !loading && (
            <div className="mt-8">
              <h2 className="text-xl font-semibold mb-3 text-center">
                Final Cinematic Video
              </h2>
              <div className="flex justify-center">
                <video
                  src={stitchedVideoUrl}
                  controls
                  className="rounded-lg shadow-md max-w-full"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
