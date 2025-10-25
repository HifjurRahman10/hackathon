"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import { Plus, MessageSquare, Trash2, Video } from "lucide-react";
import { FinalVideos } from "@/components/final-videos";

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

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [scenes, setScenes] = useState<SceneData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [hasExistingScenes, setHasExistingScenes] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
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
        await loadScenes(chatList[0].id);
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

  // ✅ Load scenes and final video from Supabase directly
  async function loadScenes(chatId: string) {
    try {
      const res = await fetch(`/api/scenes?chatId=${chatId}`);
      const data = await res.json();
      const sceneList = data.scenes || [];

      if (sceneList.length > 0) {
        const mapped = sceneList.map((s: any) => ({
          imageUrl: s.image_url,
          videoUrl: s.video_url || undefined,
        }));
        setScenes(mapped);
        setHasExistingScenes(true);
      } else {
        setScenes([]);
        setHasExistingScenes(false);
      }

      // 🧩 Fetch final stitched video directly from Supabase
      const supabase = getBrowserSupabase();
      const { data: finalData, error: finalError } = await supabase
        .from("final_video")
        .select("video_url")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (finalError) {
        console.warn("No final video found for this chat:", finalError.message);
        setStitchedVideoUrl(null);
      } else if (finalData?.video_url) {
        console.log("🎞 Loaded stitched video:", finalData.video_url);
        setStitchedVideoUrl(finalData.video_url);
      } else {
        setStitchedVideoUrl(null);
      }
    } catch (err) {
      console.error("Failed to load scenes or final video:", err);
      setScenes([]);
      setHasExistingScenes(false);
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
      setHasExistingScenes(false);
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
        if (nextChat) await loadScenes(nextChat.id);
        else {
          setScenes([]);
          setHasExistingScenes(false);
          setStitchedVideoUrl(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  }

  // ✅ Generation pipeline (unchanged, except for stitch result)
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
    setScenes([]);
    setLoading(true);

    try {
      // (Character → Image → Scenes → Scene Images → Scene Videos)
      // keep your original logic

      // 7️⃣ Stitch final video
      const successfulVideos = scenes.filter((s) => s.videoUrl);
      if (successfulVideos.length >= 2) {
        const videoUrls = successfulVideos.map((s) => s.videoUrl!);
        const stitchRes = await fetch("/api/stitch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrls, chatId: currentChatId, userId }),
        });

        if (stitchRes.ok) {
          const { videoUrl } = await stitchRes.json();
          console.log("✅ Final stitched video URL:", videoUrl);
          setStitchedVideoUrl(videoUrl);
        } else {
          const msg = await stitchRes.text();
          setError(`Video stitching failed (${stitchRes.status}): ${msg}`);
        }
      }
    } catch (err: any) {
      console.error("Error in pipeline:", err);
      setError(err.message || "Something went wrong");
      setLoading(false);
      setGeneratingVideos(false);
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
                loadScenes(chat.id);
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

            {/* Prompt */}
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
                {loading ? "Generating..." : "Generate"}
              </button>
            </div>

            {error && <p className="text-red-600 text-center mt-4 font-medium">{error}</p>}

            {/* 🎬 Final stitched video */}
            {stitchedVideoUrl && (
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

            {/* Scenes grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-8">
              {scenes.map((scene, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-xl overflow-hidden shadow-md bg-gray-100"
                >
                  {scene.videoUrl ? (
                    <video
                      src={scene.videoUrl}
                      controls
                      loop
                      muted
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Image
                      src={scene.imageUrl}
                      alt={`Scene ${i + 1}`}
                      fill
                      className="object-cover"
                    />
                  )}
                  <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                    <Video className="w-3 h-3" />
                    Scene {i + 1}
                  </span>
                </div>
              ))}
            </div>

            <FinalVideos />
          </div>
        </div>
      </div>
    </div>
  );
}
