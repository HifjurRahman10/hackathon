"use client";
import { useEffect, useState } from "react";
import { sb } from "@/lib/auth/supabase-browser";

const supabase = sb();

export default function DashboardPage() {
  const [chats, setChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [numScenes, setNumScenes] = useState(3);
  const [messageInput, setMessageInput] = useState("");

  // Fetch chats for current user
  useEffect(() => {
    const fetchChats = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Map Supabase Auth UID to your users.id UUID
      const { data: currentUser } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_id", user.id)
        .single();

      if (!currentUser) return;

      const { data, error } = await supabase
        .from("chats")
        .select("*, scenes(*)")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false });

      if (!error && data) {
        const withMessages = data.map((c: any) => ({ ...c, messages: c.messages || [] }));
        setChats(withMessages);

        if (!activeChatId && data.length > 0) setActiveChatId(data[0].id);
      }
    };

    fetchChats();
  }, [activeChatId]);

  // Create new chat
  const newChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: currentUser } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_id", user.id)
      .single();

    if (!currentUser) return;

    const chatTitle = `New Chat ${chats.length + 1}`;

    const { data, error } = await supabase
      .from("chats")
      .insert([{ title: chatTitle, user_id: currentUser.id }])
      .select()
      .single();

    if (!error && data) {
      setChats((prev) => [...prev, { ...data, scenes: [], messages: [] }]);
      setActiveChatId(data.id);
    } else {
      console.error("Failed to create chat:", error);
    }
  };

  // Send message → generate scenes
  const sendMessage = async () => {
    if (!activeChatId || !messageInput.trim()) return;

    setLoading(true);
    try {
      const chat = chats.find((c) => c.id === activeChatId);
      if (!chat) return;

      // Append user message locally
      const userMessage = { role: "user", content: messageInput };
      chat.messages = [...chat.messages, userMessage];
      setMessageInput("");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          messages: chat.messages,
          numScenes,
        }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const data = await res.json();
      const updatedScenes = [...chat.scenes, ...data.scenes];

      setChats((prev) =>
        prev.map((c) =>
          c.id === chat.id ? { ...c, scenes: updatedScenes, messages: chat.messages } : c
        )
      );

      await Promise.all(data.scenes.map((scene: any) => generateImage(scene)));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Generate image for a scene
  const generateImage = async (scene: any, forceRegenerate = false) => {
    if (!activeChatId) return;

    if (scene.imageUrl && !forceRegenerate) {
      try {
        const res = await fetch(scene.imageUrl, { method: "HEAD" });
        if (res.ok) return;
      } catch {}
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

  const activeChat = chats.find((c) => c.id === activeChatId);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-72 border-r border-gray-200 flex flex-col p-4">
        <button
          onClick={newChat}
          className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          + New Chat
        </button>

        <div className="mb-4 flex items-center space-x-2">
          <label className="text-gray-700">Scenes:</label>
          <input
            type="number"
            min={1}
            max={10}
            value={numScenes}
            onChange={(e) => setNumScenes(Number(e.target.value))}
            className="w-16 px-2 py-1 border rounded"
          />
        </div>

        <div className="flex-1 overflow-y-auto">
          <ul className="space-y-2">
            {chats.map((chat) => (
              <li
                key={chat.id}
                onClick={() => setActiveChatId(chat.id)}
                className={`p-2 rounded cursor-pointer transition ${
                  chat.id === activeChatId
                    ? "bg-blue-100 font-semibold"
                    : "hover:bg-gray-100"
                }`}
              >
                {chat.title || `Chat #${chat.id}`}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col p-6">
        {activeChat ? (
          <>
            <div className="flex-1 overflow-y-auto mb-4 space-y-4">
              {activeChat.messages.map((msg: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-2 rounded max-w-xs ${
                    msg.role === "user"
                      ? "bg-blue-600 text-white self-end"
                      : "bg-gray-200 text-gray-800 self-start"
                  }`}
                >
                  {msg.content}
                </div>
              ))}

              {activeChat.scenes.map((scene: any) => (
                <div key={scene.sceneNumber} className="bg-white p-4 rounded shadow-sm">
                  <p className="font-semibold mb-2">Scene {scene.sceneNumber}</p>
                  <p className="mb-2">{scene.scenePrompt || scene.sceneText}</p>
                  {scene.imageUrl ? (
                    <img
                      src={scene.imageUrl}
                      alt={`Scene ${scene.sceneNumber}`}
                      className="w-full rounded border"
                    />
                  ) : (
                    <button
                      onClick={() => generateImage(scene)}
                      className="mt-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition"
                    >
                      Generate Image
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={messageInput}
                onChange={(e) => setMessageInput(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 border rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              />
              <button
                onClick={sendMessage}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
              >
                Send
              </button>
            </div>

            {loading && <p className="text-gray-500 mt-2">Loading...</p>}
          </>
        ) : (
          <p className="text-gray-500">No chats yet. Click "New Chat" to start!</p>
        )}
      </div>
    </div>
  );
}
