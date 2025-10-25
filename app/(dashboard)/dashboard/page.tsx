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
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const [fetchingVideo, setFetchingVideo] = useState(false);

  const [videoCache, setVideoCache] = useState<
    Record<string, string | null | undefined>
  >({});

  const fetchSeqRef = useRef(0);

  useEffect(() => {
    (async () => {
      const supabase = getBrowserSupabase();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setError("Please sign in first.");
        return;
      }

      setUserId(user.id);

      const res = await fetch(`/api/chats?userId=${user.id}`);
      const data = await res.json();
      const list: Chat[] = data.chats || [];

      if (list.length === 0) {
        const newRes = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, title: "New Chat" }),
        });

        const { chat } = await newRes.json();
        setChats([chat]);
        setCurrentChatId(chat.id);
        setVideoCache((prev) => ({
          ...prev,
          [chat.id]: undefined,
        }));
      } else {
        setChats(list);
        setCurrentChatId(list[0].id);
      }
    })();
  }, []);

  async function fetchFinalVideoUrlForChat(chatId: string) {
    const supabase = getBrowserSupabase();

    const { data, error } = await supabase
      .from("final_video")
      .select("video_url")
      .eq("chat_id", chatId)
      .limit(1);

    if (error) {
      return null;
    }

    if (!data || data.length === 0) {
      return null;
    }

    return (data[0].video_url as string | null) ?? null;
  }

  useEffect(() => {
    async function loadVideoForChat(chatId: string) {
      const cached = videoCache[chatId];

      if (cached !== undefined && cached !== null && cached !== "") {
        setActiveVideoUrl(cached);
        setFetchingVideo(false);
        return;
      }

      if (cached === null) {
        setActiveVideoUrl(null);
        setFetchingVideo(false);
        return;
      }

      setFetchingVideo(true);

      const seq = ++fetchSeqRef.current;

      const url = await fetchFinalVideoUrlForChat(chatId);

      if (seq !== fetchSeqRef.current) {
        return;
      }
      if (chatId !== currentChatId) {
        return;
      }

      setVideoCache((prev) => ({
        ...prev,
        [chatId]: url,
      }));

      setActiveVideoUrl(url);
      setFetchingVideo(false);
    }

    if (!currentChatId) {
      setActiveVideoUrl(null);
      setFetchingVideo(false);
      return;
    }

    loadVideoForChat(currentChatId);
  }, [currentChatId, videoCache]);

  function handleChatClick(chatId: string) {
    if (chatId === currentChatId) return;
    setCurrentChatId(chatId);
    setPrompt("");
    setError(null);
    setProgress(0);

    const cached = videoCache[chatId];
    if (cached !== undefined) {
      setActiveVideoUrl(cached ?? null);
    } else {
      setActiveVideoUrl(null);
    }
  }

  async function createNewChat() {
    if (!userId) {
      setError("Please sign in first.");
      return;
    }

    const res = await fetch("/api/chats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, title: "New Chat" }),
    });
    const { chat } = await res.json();

    setChats((prev) => [chat, ...prev]);
    setCurrentChatId(chat.id);
    setPrompt("");
    setError(null);
    setProgress(0);

    setVideoCache((prev) => ({
      ...prev,
      [chat.id]: undefined,
    }));
  }

  async function deleteChat(chatId: string) {
    await fetch(`/api/chats?chatId=${chatId}`, { method: "DELETE" });

    setChats((prev) => prev.filter((c) => c.id !== chatId));

    setVideoCache((prev) => {
      const next = { ...prev };
      delete next[chatId];
      return next;
    });

    if (currentChatId === chatId) {
      const remaining = chats.filter((c) => c.id !== chatId);
      if (remaining.length > 0) {
        const nextChat = remaining[0];
        setCurrentChatId(nextChat.id);

        const cached = videoCache[nextChat.id];
        if (cached !== undefined) {
          setActiveVideoUrl(cached ?? null);
        } else {
          setActiveVideoUrl(null);
        }
      } else {
        setCurrentChatId(null);
        setActiveVideoUrl(null);
        setFetchingVideo(false);
      }
    }
  }

  async function handleGenerate() {
    if (!userId || !currentChatId) {
      setError("Please sign in first.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);
    setActiveVideoUrl(null);

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
      const sceneVideoUrls = await Promise.all(
        scenes.map(async (s: SceneAPIData) => {
          const imgJson = await fetch("/api/genImage", {
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

          const vidJson = await fetch("/api/genVideo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: s.scene_video_prompt,
              imageUrl: imgJson.imageUrl,
              sceneId: s.id,
              userId,
              metadata: { chatId: currentChatId },
            }),
          }).then((r) => r.json());

          return vidJson.videoUrl as string;
        })
      );

      setProgress(95);
      const stitchJson = await fetch("/api/stitch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrls: sceneVideoUrls,
          chatId: currentChatId,
          userId,
        }),
      }).then((r) => r.json());

      const stitchedUrl = stitchJson.videoUrl as string | undefined;

      if (stitchedUrl) {
        setActiveVideoUrl(stitchedUrl);
        setVideoCache((prev) => ({
          ...prev,
          [currentChatId]: stitchedUrl,
        }));
      } else {
        setActiveVideoUrl(null);
        setVideoCache((prev) => ({
          ...prev,
          [currentChatId]: null,
        }));
      }

      setProgress(100);
    } catch (e: any) {
      setError(e.message || "Failed to generate.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen bg-gray-50 text-black">
      <aside className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4">
          <button
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition"
          >
            <Plus className="w-5 h-5" />
            <span className="text-sm font-medium">New Chat</span>
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
      </aside>

      <main className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm z-10">
            <div className="w-32 h-32 rounded-full border-4 border-gray-400 flex items-center justify-center text-2xl font-bold text-gray-800">
              {progress}%
            </div>
          </div>
        )}

        {!activeVideoUrl ? (
          <div className="w-full max-w-3xl">
            <h1 className="text-2xl font-semibold mb-4 text-center">
              Cinematic Scene Generator
            </h1>

            {currentChatId && (
              <p className="text-center text-[11px] text-gray-500 mb-2">
                Chat {currentChatId.slice(0, 8)} •{" "}
                {fetchingVideo
                  ? "Loading video…"
                  : videoCache[currentChatId] === null
                  ? "No stitched video yet"
                  : "Ready"}
              </p>
            )}

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
              disabled={loading || !prompt.trim() || !currentChatId}
              className="px-6 py-2 bg-black text-white rounded-lg disabled:opacity-50 hover:bg-gray-800 transition"
              >
                {loading ? "Generating..." : "Generate"}
              </button>
            </div>

            {error && (
              <p className="text-red-600 text-center mt-4 font-medium">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="w-full flex flex-col items-center">
            <video
              key={activeVideoUrl}
              src={activeVideoUrl}
              controls
              autoPlay
              playsInline
              className="rounded-lg shadow-lg max-w-full max-h-[80vh] object-contain border border-gray-300"
            />
            {currentChatId && (
              <p className="text-[11px] text-gray-500 mt-2 select-text">
                Chat {currentChatId.slice(0, 8)} • Stitched final video
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
