"use client";

import { useState, useEffect, useRef } from "react";
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
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [hasExistingScenes, setHasExistingScenes] = useState(false);
  const [stitchedVideoUrl, setStitchedVideoUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const progressRef = useRef(0);

  // Progress control
  const setProgressSafe = (val: number) => {
    const next = Math.min(99, Math.max(val, progressRef.current));
    progressRef.current = next;
    setProgress(next);
  };
  const setProgressDone = () => {
    progressRef.current = 100;
    setProgress(100);
  };

  const CACHE_KEY = "cached_chats_v1";
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  useEffect(() => {
    async function fetchUser() {
      const supabase = getBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        setError("Please sign in to use this feature");
        return;
      }

      // Sync user server-side
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
      await loadChatsWithCache(user.id);
    }
    fetchUser();
  }, []);

  async function loadChatsWithCache(uid: string) {
    const cacheStr = localStorage.getItem(CACHE_KEY);
    let cached = null;
    if (cacheStr) {
      try {
        cached = JSON.parse(cacheStr);
        if (Date.now() - cached.timestamp < CACHE_TTL && cached.data.length > 0) {
          setChats(cached.data);
          setCurrentChatId(cached.data[0].id);
          await checkExistingScenes(cached.data[0].id);
          refreshChats(uid, false); // refresh in background
          return;
        }
      } catch (e) {
        console.warn("Cache parse error:", e);
      }
    }
    await refreshChats(uid, true);
  }

  async function refreshChats(uid: string, useResult: boolean) {
    try {
      const res = await fetch(`/api/chats?userId=${uid}`);
      const { chats } = await res.json();
      if (!chats || chats.length === 0) {
        const newChat = await createNewChatInternal(uid);
        setChats([newChat]);
        setCurrentChatId(newChat.id);
        cacheChats([newChat]);
        return;
      }
      if (useResult) {
        setChats(chats);
        setCurrentChatId(chats[0].id);
        await checkExistingScenes(chats[0].id);
      }
      cacheChats(chats);
    } catch (err) {
      console.error("Failed to load chats:", err);
    }
  }

  function cacheChats(chats: Chat[]) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: chats }));
    } catch {}
  }

  async function checkExistingScenes(chatId: string) {
    try {
      const res = await fetch(`/api/scenes?chatId=${chatId}`);
      const { scenes } = await res.json();
      setHasExistingScenes(Array.isArray(scenes) && scenes.length > 0);
    } catch {
      setHasExistingScenes(false);
    }
  }

  async function createNewChatInternal(uid: string): Promise<Chat> {
    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid, title: "New Chat" }),
    });
    const { chat } = await res.json();
    return chat;
  }

  async function createNewChat() {
    if (!userId) return;
    const newChat = await createNewChatInternal(userId);
    const updated = [newChat, ...chats];
    setChats(updated);
    setCurrentChatId(newChat.id);
    cacheChats(updated);
    setHasExistingScenes(false);
    setPrompt("");
    setStitchedVideoUrl(null);
    setError(null);
    setProgress(0);
    progressRef.current = 0;
  }

  async function deleteChat(chatId: string) {
    try {
      await fetch(`/api/chats?chatId=${chatId}`, { method: "DELETE" });
      const updated = chats.filter((c) => c.id !== chatId);
      if (updated.length === 0 && userId) {
        const newChat = await createNewChatInternal(userId);
        setChats([newChat]);
        setCurrentChatId(newChat.id);
        cacheChats([newChat]);
        setHasExistingScenes(false);
      } else {
        setChats(updated);
        setCurrentChatId(updated[0]?.id || null);
        cacheChats(updated);
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
    if (hasExistingScenes) {
      setError("Only one prompt allowed per chat. Create a new chat to generate more.");
      return;
    }

    setError(null);
    setLoading(true);
    setProgress(1);
    progressRef.current = 1;
    setStitchedVideoUrl(null);

    try {
      // 1️⃣ Character
      const charRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, mode: "character", userId, chatId: currentChatId }),
      });
      if (!charRes.ok) throw new Error("Character generation failed");
      const charData = (await charRes.json()).data;
      setProgressSafe(10);

      // 2️⃣ Character Image
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
      setProgressSafe(20);

      // 3️⃣ Scene prompts
      const sceneRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${prompt}\nCharacter: ${charData.name}\nDesc: ${charData.image_prompt}`,
          mode: "scenes",
          userId,
          chatId: currentChatId,
        }),
      });
      if (!sceneRes.ok) throw new Error("Scene generation failed");
      const scenesData = (await sceneRes.json()).data;
      setProgressSafe(35);

      // 4️⃣ Scene Images (parallel)
      const sceneImages = await Promise.all(
        scenesData.map(async (scene: any) => {
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
          const { imageUrl } = await img.json();
          return { imageUrl, sceneId: scene.id, videoPrompt: scene.scene_video_prompt };
        })
      );
      setProgressSafe(55);

      // 5️⃣ Videos (parallel)
      const videoResults = await Promise.all(
        sceneImages.map(async (scene) => {
          const res = await fetch("/api/genVideo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: scene.videoPrompt,
              imageUrl: scene.imageUrl,
              sceneId: scene.sceneId,
              userId,
              metadata: { chatId: currentChatId },
            }),
          });
          const { videoUrl } = await res.json();
          return videoUrl;
        })
      );
      setProgressSafe(85);

      // 6️⃣ Stitch
      const validVideos = videoResults.filter(Boolean);
      if (validVideos.length >= 2) {
        const stitchRes = await fetch("/api/stitch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrls: validVideos, chatId: currentChatId, userId }),
        });
        const { videoUrl } = await stitchRes.json();
        setStitchedVideoUrl(videoUrl);
        setProgressDone();
        setHasExistingScenes(true);
      } else {
        throw new Error("Not enough videos to stitch");
      }
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
              onClick={() => {
                setCurrentChatId(chat.id);
                checkExistingScenes(chat.id);
                setError(null);
                setStitchedVideoUrl(null);
                setProgress(0);
                progressRef.current = 0;
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

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-semibold mb-4 text-center">
              Cinematic Scene Generator
            </h1>

            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
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
                {loading ? "Working..." : "Generate"}
              </button>
            </div>

            {error && <p className="text-red-600 text-center mt-4 font-medium">{error}</p>}

            {(loading || progress > 0) && progress < 100 && (
              <div className="mt-8">
                <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                  <div
                    className="h-4 bg-black transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            {stitchedVideoUrl && (
              <div className="mt-10">
                <h2 className="text-xl font-semibold mb-4 text-center">✅ Final Cinematic</h2>
                <div className="flex justify-center">
                  <video
                    src={stitchedVideoUrl}
                    controls
                    className="max-w-full rounded-lg shadow-md"
                  />
                </div>
                <div className="mt-2 text-center text-sm text-gray-600">100% — Video completed</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
