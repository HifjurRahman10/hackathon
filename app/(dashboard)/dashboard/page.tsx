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
  // ---------- core state ----------
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);

  // prompt / pipeline state
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // what we're showing right now in the video player
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);

  // whether we're in the middle of fetching from DB (only happens if cache miss)
  const [fetchingVideo, setFetchingVideo] = useState(false);

  // per-chat cache:
  //   undefined  => we have NEVER fetched this chat's final video
  //   null       => fetched, no video in DB for that chat
  //   "http..."  => fetched, we have a stitched video URL
  const [videoCache, setVideoCache] = useState<Record<string, string | null | undefined>>({});

  // sequence counter to kill race conditions
  const fetchSeqRef = useRef(0);

  // -------------------------------------------------
  // 1. On mount -> get user -> load chats
  // -------------------------------------------------
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

      // load chats for that user
      const res = await fetch(`/api/chats?userId=${user.id}`);
      const json = await res.json();
      const list: Chat[] = json.chats || [];

      if (list.length === 0) {
        // create first chat if none exist
        const resNew = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: user.id, title: "New Chat" }),
        });
        const { chat } = await resNew.json();

        setChats([chat]);
        setCurrentChatId(chat.id);

        // cache init: this new chat has definitely no video yet
        setVideoCache((prev) => ({
          ...prev,
          [chat.id]: null,
        }));

        // activeVideoUrl will update via effect below
      } else {
        setChats(list);
        setCurrentChatId(list[0].id);

        // don't fetch yet; effect below will handle
      }
    })();
  }, []);

  // -------------------------------------------------
  // 2. Whenever currentChatId changes:
  //    - If we already have it cached: use cache (NO FETCH)
  //    - Else fetch from Supabase ONCE and cache result.
  // -------------------------------------------------
  useEffect(() => {
    async function loadVideoForChat(chatId: string) {
      // if cached, just use it
      const cached = videoCache[chatId];
      if (cached !== undefined) {
        setActiveVideoUrl(cached ?? null);
        setFetchingVideo(false);
        return;
      }

      // cache miss: fetch from DB
      setFetchingVideo(true);

      const seq = ++fetchSeqRef.current;
      const supabase = getBrowserSupabase();

      // we'll try to order by created_at first (recommended schema),
      // if that fails because you haven't added created_at yet,
      // we fallback to just .limit(1)
      async function tryPrimary() {
        return supabase
          .from("final_video")
          .select("video_url")
          .eq("chat_id", chatId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
      }

      async function tryFallback() {
        return supabase
          .from("final_video")
          .select("video_url")
          .eq("chat_id", chatId)
          .limit(1)
          .maybeSingle();
      }

      let data;
      let error;
      let result = await tryPrimary();
      if (result.error && /created_at/i.test(result.error.message || "")) {
        result = await tryFallback();
      }
      data = result.data;
      error = result.error;

      // ignore if user already switched chats or newer fetch started
      if (seq !== fetchSeqRef.current) return;
      if (chatId !== currentChatId) return;

      const url = !error && data?.video_url ? data.video_url : null;

      // update cache
      setVideoCache((prev) => ({
        ...prev,
        [chatId]: url, // url or null
      }));

      // reflect in UI
      setActiveVideoUrl(url);
      setFetchingVideo(false);
    }

    if (!currentChatId) {
      setActiveVideoUrl(null);
      setFetchingVideo(false);
      return;
    }

    loadVideoForChat(currentChatId);
  }, [currentChatId, videoCache, currentChatId]); // `videoCache` in deps so we reuse cache without refetch

  // -------------------------------------------------
  // 3. Click a chat in sidebar
  //    -> just set currentChatId. The useEffect above handles the rest.
  // -------------------------------------------------
  function handleChatClick(chatId: string) {
    if (chatId === currentChatId) return;
    setCurrentChatId(chatId);
    setPrompt("");
    setError(null);
    setProgress(0);
    // no manual fetch here — effect will load from cache or DB
  }

  // -------------------------------------------------
  // 4. Create new chat
  //    -> new chat goes in list, becomes active,
  //       cache starts as null (no video yet),
  //       UI switches immediately without refetch.
  // -------------------------------------------------
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

    // pre-cache: new chat has no video yet
    setVideoCache((prev) => ({
      ...prev,
      [chat.id]: null,
    }));
  }

  // -------------------------------------------------
  // 5. Delete chat
  //    -> remove it from list,
  //       remove it from cache,
  //       jump to next chat & rely on cache for it.
  // -------------------------------------------------
  async function deleteChat(chatId: string) {
    await fetch(`/api/chats?chatId=${chatId}`, { method: "DELETE" });

    setChats((prev) => prev.filter((c) => c.id !== chatId));

    setVideoCache((prev) => {
      const next = { ...prev };
      delete next[chatId];
      return next;
    });

    if (currentChatId === chatId) {
      // pick new active chat
      const remaining = chats.filter((c) => c.id !== chatId);
      if (remaining.length > 0) {
        const nextChat = remaining[0];
        setCurrentChatId(nextChat.id);
        // effect will display cached video for nextChat or fetch if not cached
      } else {
        setCurrentChatId(null);
        setActiveVideoUrl(null);
        setFetchingVideo(false);
      }
    }
  }

  // -------------------------------------------------
  // 6. Generation pipeline
  //    -> after we stitch final video, we IMMEDIATELY
  //       update cache for this chat so we never refetch later.
  // -------------------------------------------------
  async function handleGenerate() {
    if (!userId || !currentChatId) {
      setError("Please sign in first.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);

    // hide old video while regenerating new
    setActiveVideoUrl(null);
    // also mark cache for this chat as "unfetched yet" so after stitch we overwrite
    // (IMPORTANT: we DON'T nuke it to undefined, we just let our own code set new URL below)

    try {
      // 1️⃣ Generate character spec
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

      // 2️⃣ Generate character image
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

      // 3️⃣ Generate scene prompts
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

      // 4️⃣ For each scene: image -> video
      setProgress(70);
      const sceneVideoUrls = await Promise.all(
        scenes.map(async (s: SceneAPIData) => {
          // scene image using SAME character
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

          // scene video from that frame
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

          return vidJson.videoUrl;
        })
      );

      // 5️⃣ Stitch final video
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

      // update UI immediately
      if (stitchedUrl) {
        setActiveVideoUrl(stitchedUrl);

        // update cache so if we switch away and back,
        // we don't refetch from Supabase
        setVideoCache((prev) => ({
          ...prev,
          [currentChatId]: stitchedUrl,
        }));
      } else {
        // no URL from stitch -> cache null
        setActiveVideoUrl(null);
        setVideoCache((prev) => ({
          ...prev,
          [currentChatId]: null,
        }));
      }

      setProgress(100);
    } catch (e: any) {
      console.error("Generation error:", e);
      setError(e.message || "Failed to generate.");
    } finally {
      setLoading(false);
    }
  }

  // -------------------------------------------------
  // 7. UI
  // -------------------------------------------------
  return (
    <div className="flex h-screen bg-gray-50 text-black">
      {/* Sidebar */}
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

      {/* Main */}
      <main className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
        {/* full-screen overlay during generation */}
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
