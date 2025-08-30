"use client";

import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default function DashboardPage() {
  const [chats, setChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [selectedScene, setSelectedScene] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  // ✅ Fetch chats for current user
  useEffect(() => {
    const fetchChats = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("chats")
        .select("*, scenes(*)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        const withMessages = data.map((c: any) => ({ ...c, messages: c.messages || [] }));
        setChats(withMessages);
      }
    };

    fetchChats();
  }, []);

  // ✅ New chat creation
  const newChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("chats")
      .insert([{ title: "New Chat", user_id: user.id }])
      .select()
      .single();

    if (!error && data) {
      setChats((prev) => [...prev, { ...data, scenes: [], messages: [] }]);
      setActiveChatId(data.id);
      setSelectedScene(1);
    }
  };

  // ✅ Send message → API generates scenes
  const sendMessage = async (message: string, numScenes: number) => {
    if (!activeChatId) return;

    setLoading(true);
    try {
      const chat = chats.find((c) => c.id === activeChatId);
      if (!chat) return;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          messages: chat.messages || [],
          numScenes,
        }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const data = await res.json();
      const updatedScenes = [...chat.scenes, ...data.scenes];

      const updatedChats = chats.map((c) =>
        c.id === chat.id ? { ...c, scenes: updatedScenes } : c
      );
      setChats(updatedChats);

      // ✅ Generate all images in parallel
      await Promise.all(
        data.scenes.map((scene: any) => generateImage(scene))
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ✅ Generate image (parallel-ready)
  const generateImage = async (scene: any, forceRegenerate = false) => {
    if (!activeChatId) return;

    // Skip if already has valid Supabase URL
    if (scene.imageUrl && !forceRegenerate) {
      try {
        const res = await fetch(scene.imageUrl, { method: "HEAD" });
        if (res.ok) return;
      } catch {
        console.warn("Supabase URL expired, regenerating...");
      }
    }

    try {
      const res = await fetch("/api/genImage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: scene.sceneImagePrompt,
          chatId: activeChatId,
          sceneNumber: scene.sceneNumber,
          force: forceRegenerate,
        }),
      });

      if (!res.ok) throw new Error("Image generation failed");

      const { imageUrl } = await res.json();

      // Update scene in local state
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId
            ? {
                ...c,
                scenes: c.scenes.map((s: any) =>
                  s.sceneNumber === scene.sceneNumber ? { ...s, imageUrl } : s
                ),
              }
            : c
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-4">
      <div className="flex gap-4 mb-4">
        <button
          onClick={newChat}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          New Chat
        </button>
        {loading && <p>Loading...</p>}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {/* Chats list */}
        <div className="col-span-1 border p-2 rounded">
          <h2 className="font-bold mb-2">Chats</h2>
          <ul>
            {chats.map((chat) => (
              <li
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                className={`p-2 cursor-pointer rounded ${
                  chat.id === activeChatId ? "bg-blue-100" : "hover:bg-gray-100"
                }`}
              >
                {chat.title}
              </li>
            ))}
          </ul>
        </div>

        {/* Scenes */}
        <div className="col-span-2 border p-2 rounded">
          {activeChatId ? (
            <>
              <h2 className="font-bold mb-2">Scenes</h2>
              <ul>
                {chats
                  .find((c) => c.id === activeChatId)
                  ?.scenes.map((scene: any) => (
                    <li
                      key={scene.sceneNumber}
                      className="mb-4 border p-2 rounded"
                    >
                      <p className="font-semibold">Scene {scene.sceneNumber}</p>
                      <p>{scene.sceneText}</p>

                      {scene.imageUrl ? (
                        <img
                          src={scene.imageUrl}
                          alt={`Scene ${scene.sceneNumber}`}
                          className="mt-2 rounded"
                        />
                      ) : (
                        <button
                          onClick={() => generateImage(scene)}
                          className="mt-2 px-3 py-1 bg-green-600 text-white rounded"
                        >
                          Generate Image
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </>
          ) : (
            <p>Select a chat to view scenes</p>
          )}
        </div>
      </div>
    </div>
  );
}
