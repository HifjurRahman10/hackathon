"use client";

import { useState, useEffect, useRef } from "react";
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

  // ✅ map of chatId → stitched video
  const [videoByChat, setVideoByChat] = useState<Record<string, string | null>>({});
  const [activeVideo, setActiveVideo] = useState<string | null>(null);

  // Used to cancel stale async fetches
  const activeChatRef = useRef<string | null>(null);

  // -------------------------------------------------------------
  // INITIAL LOAD
  // -------------------------------------------------------------
  useEffect(() => {
    (async () => {
      const supabase = getBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError("Please sign in first.");
        return;
      }
      setUserId(user.id);
      await loadChats(user.id);
    })();
  }, []);

  // -------------------------------------------------------------
  // LOAD CHATS + FIRST VIDEO
  // -------------------------------------------------------------
  async function loadChats(uid: string) {
    const res = await fetch(`/api/chats?userId=${uid}`);
    const data = await res.json();
    const list: Chat[] = data.chats || [];
    setChats(list);

    if (list.length > 0) {
      const first = list[0];
      setCurrentChatId(first.id);
      activeChatRef.current = first.id;
      await loadVideoForChat(first.id);
    } else {
      const resNew = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: uid, title: "New Chat" }),
      });
      const { chat } = await resNew.json();
      setChats([chat]);
      setCurrentChatId(chat.id);
      activeChatRef.current = chat.id;
      setVideoByChat({ [chat.id]: null });
    }
  }

  // -------------------------------------------------------------
  // LOAD FINAL VIDEO FOR SPECIFIC CHAT
  // -------------------------------------------------------------
  async function loadVideoForChat(chatId: string) {
    const supabase = getBrowserSupabase();
    const { data, error } = await supabase
      .from("final_video")
      .select("video_url")
      .eq("chat_id", chatId)
      .maybeSingle();

    if (activeChatRef.current !== chatId) return; // prevent race overwrite

    const url = !error && data?.video_url ? data.video_url : null;
    setVideoByChat((prev) => ({ ...prev, [chatId]: url }));
    setActiveVideo(url);
  }

  // -------------------------------------------------------------
  // CHAT SWITCH
  // -------------------------------------------------------------
  async function handleChatClick(chatId: string) {
    if (chatId === currentChatId) return;
    setCurrentChatId(chatId);
    activeChatRef.current = chatId;
    setPrompt("");
    setError(null);
    setProgress(0);

    // Show cached instantly or fetch fresh
    const cached = videoByChat[chatId];
    if (cached !== undefined) {
      setActiveVideo(cached);
    } else {
      setActiveVideo(null);
      await loadVideoForChat(chatId);
    }
  }

  // -------------------------------------------------------------
  // CREATE NEW CHAT
  // -------------------------------------------------------------
  async function createNewChat() {
    if (!userId) return;
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title: "New Chat" }),
    });
    const { chat } = await res.json();
    setChats([chat, ...chats]);
    setVideoByChat((prev) => ({ ...prev, [chat.id]: null }));
    setCurrentChatId(chat.id);
    activeChatRef.current = chat.id;
    setActiveVideo(null);
    setPrompt("");
  }

  // -------------------------------------------------------------
  // DELETE CHAT
  // -------------------------------------------------------------
  async function deleteChat(chatId: string) {
    await fetch(`/api/chats?chatId=${chatId}`, { method: "DELETE" });
    const remaining = chats.filter((c) => c.id !== chatId);
    setChats(remaining);

    setVideoByChat((prev) => {
      const updated = { ...prev };
      delete updated[chatId];
      return updated;
    });

    if (currentChatId === chatId) {
      const next = remaining[0];
      if (next) {
        handleChatClick(next.id);
      } else {
        setCurrentChatId(null);
        activeChatRef.current = null;
        setActiveVideo(null);
      }
    }
  }

  // -------------------------------------------------------------
  // GENERATE PIPELINE
  // -------------------------------------------------------------
  async function handleGenerate() {
    if (!userId || !currentChatId) return setError("Please sign in first.");
    setLoading(true);
    setError(null);
    setProgress(0);
    setActiveVideo(null);

    try {
      // 1️⃣ Character
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

      // 2️⃣ Character Image
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

      // 3️⃣ Scenes
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

      // 4️⃣ Images + Videos
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

      // 5️⃣ Stitch
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

      if (activeChatRef.current !== currentChatId) return; // safety

      setVideoByChat((prev) => ({ ...prev, [currentChatId]: videoUrl }));
      setActiveVideo(videoUrl);
      setProgress(100);
    } catch (err: any) {
      console.error("Generation error:", err);
      setError(err.message || "Failed to generate.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------------------
  // UI
  // -------------------------------------------------------------
  return (
    <div className="flex h-screen bg-gray-50 text-black">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4">
          <button
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition"
          >
            <Plus className="w-5 h-5" /> New Chat
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

      {/* Main */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-10">
            <div className="w-32 h-32 rounded-full border-4 border-gray-400 flex items-center justify-center text-2xl font-bold text-gray-800">
              {progress}%
            </div>
          </div>
        )}

        {!activeVideo ? (
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
              key={activeVideo}
              src={activeVideo}
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
