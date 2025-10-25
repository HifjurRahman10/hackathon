"use client";

import { useState, useEffect } from "react";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import { Plus, MessageSquare, Trash2 } from "lucide-react";

interface Chat {
  id: string;
  title: string;
  created_at: string;
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
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [stitchedVideoUrl, setStitchedVideoUrl] = useState<string | null>(null);

  // NEW: store all chat videos in memory
  const [videoUrlsByChatId, setVideoUrlsByChatId] = useState<Record<string, string | null>>({});

  // ✅ Load user + chats on mount
  useEffect(() => {
    async function init() {
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

    init();
  }, []);

  // ✅ Load user's chats
  async function loadChats(uid: string) {
    try {
      const res = await fetch(`/api/chats?userId=${uid}`);
      const data = await res.json();
      const chatList: Chat[] = data.chats || [];
      setChats(chatList);

      if (chatList.length > 0) {
        const firstChat = chatList[0];
        setCurrentChatId(firstChat.id);
        await loadFinalVideo(firstChat.id);
      } else {
        // create first chat if none
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

  // ✅ Load final stitched video per chat
  async function loadFinalVideo(chatId: string) {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase
      .from("final_video")
      .select("video_url")
      .eq("chat_id", chatId)
      .single();

    if (!error && data?.video_url) {
      setVideoUrlsByChatId((prev) => ({ ...prev, [chatId]: data.video_url }));
      if (currentChatId === chatId) setStitchedVideoUrl(data.video_url);
    } else {
      setVideoUrlsByChatId((prev) => ({ ...prev, [chatId]: null }));
      if (currentChatId === chatId) setStitchedVideoUrl(null);
    }
  }

  // ✅ Switch chats without losing stored videos
  async function handleChatClick(chatId: string) {
    setCurrentChatId(chatId);
    setPrompt("");
    setError(null);
    setProgress(0);
    const existingUrl = videoUrlsByChatId[chatId];
    if (existingUrl) {
      setStitchedVideoUrl(existingUrl);
    } else {
      setStitchedVideoUrl(null);
      await loadFinalVideo(chatId);
    }
  }

  // ✅ Create new chat
  async function createNewChat() {
    if (!userId) return;
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title: "New Chat" }),
    });
    const { chat } = await res.json();
    setChats([chat, ...chats]);
    setCurrentChatId(chat.id);
    setPrompt("");
    setError(null);
    setProgress(0);
    setStitchedVideoUrl(null);
  }

  // ✅ Delete chat safely
  async function deleteChat(chatId: string) {
    await fetch(`/api/chats?chatId=${chatId}`, { method: "DELETE" });
    const updated = chats.filter((c) => c.id !== chatId);
    setChats(updated);
    const { [chatId]: _, ...rest } = videoUrlsByChatId;
    setVideoUrlsByChatId(rest);

    if (currentChatId === chatId) {
      const next = updated[0];
      if (next) {
        setCurrentChatId(next.id);
        handleChatClick(next.id);
      } else {
        setCurrentChatId(null);
        setStitchedVideoUrl(null);
      }
    }
  }

  // ✅ Generation pipeline
  async function handleGenerate() {
    if (!userId || !currentChatId) return setError("Please sign in first.");
    setError(null);
    setLoading(true);
    setProgress(0);
    setStitchedVideoUrl(null);

    try {
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
      const { data: charData } = await charRes.json();

      setProgress(25);
      await fetch("/api/genImage", {
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

      setProgress(45);
      const sceneRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${prompt}\nCharacter: ${charData.name}`,
          mode: "scenes",
          userId,
          chatId: currentChatId,
          sceneCount: 6,
        }),
      });
      const { data: scenes } = await sceneRes.json();

      setProgress(70);
      const sceneResults = await Promise.all(
        scenes.map(async (s: SceneAPIData) => {
          const img = await fetch("/api/genImage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: s.scene_image_prompt,
              type: "scene",
              recordId: s.id,
              userId,
              metadata: { chatId: currentChatId },
            }),
          }).then((r) => r.json());

          const vid = await fetch("/api/genVideo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: s.scene_video_prompt,
              imageUrl: img.imageUrl,
              sceneId: s.id,
              userId,
              metadata: { chatId: currentChatId },
            }),
          }).then((r) => r.json());

          return vid.videoUrl;
        })
      );

      setProgress(95);
      const stitch = await fetch("/api/stitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrls: sceneResults,
          chatId: currentChatId,
          userId,
        }),
      });
      const { videoUrl } = await stitch.json();

      // ✅ Store stitched video per chat
      setVideoUrlsByChatId((prev) => ({ ...prev, [currentChatId]: videoUrl }));
      setStitchedVideoUrl(videoUrl);
      setProgress(100);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  // ✅ UI
  return (
    <div className="flex h-screen bg-gray-50 text-black">
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
              onClick={() => handleChatClick(chat.id)}
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
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-10">
            <div className="w-32 h-32 rounded-full border-4 border-gray-400 flex items-center justify-center text-2xl font-bold text-gray-800">
              {progress}%
            </div>
          </div>
        )}

        {!stitchedVideoUrl ? (
          <div className="w-full max-w-3xl">
            <h1 className="text-2xl font-semibold mb-4 text-center">
              Cinematic Scene Generator
            </h1>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your cinematic story idea..."
              className="w-full p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black min-h-[100px]"
              disabled={loading}
            />

            <div className="flex justify-center mt-4">
              <button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim()}
                className="px-6 py-2 bg-black text-white rounded-lg disabled:opacity-50 hover:bg-gray-800 transition"
              >
                {loading ? "Generating..." : "Generate"}
              </button>
            </div>

            {error && (
              <p className="text-red-600 text-center mt-4 font-medium">{error}</p>
            )}
          </div>
        ) : (
          <div className="w-full flex justify-center items-center">
            <video
              src={stitchedVideoUrl}
              controls
              autoPlay
              playsInline
              className="rounded-lg shadow-lg max-w-full max-h-[80vh] object-contain border border-gray-300"
            />
          </div>
        )}
      </div>
    </div>
  );
}
