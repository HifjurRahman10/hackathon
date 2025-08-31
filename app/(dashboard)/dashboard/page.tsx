"use client";
import { useEffect, useState, useRef } from "react";
import { sb } from "@/lib/auth/supabase-browser";

const supabase = sb();

export default function DashboardPage() {
  const [chats, setChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [numScenes, setNumScenes] = useState(3);
  const [inputs, setInputs] = useState<Record<number, string>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

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
        const withMessages = data.map((c: any) => ({
          ...c,
          messages: c.messages || [],
        }));

        setChats(withMessages);
        if (withMessages.length) setActiveChatId(withMessages[0].id);

        const savedInputs: Record<number, string> = {};
        withMessages.forEach((c: any) => savedInputs[c.id] = "");
        setInputs(savedInputs);
      }
    };

    fetchChats();
  }, []);

  const activeChat = chats.find((c) => c.id === activeChatId);

  const handleInputChange = (value: string) => {
    if (!activeChatId) return;
    setInputs((prev) => ({ ...prev, [activeChatId]: value }));
  };

  const sendMessage = async () => {
    if (!activeChatId) return;
    const messageInput = inputs[activeChatId]?.trim();
    if (!messageInput) return;

    setLoading(true);
    try {
      const chat = chats.find((c) => c.id === activeChatId);
      if (!chat) return;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          messages: [...chat.messages, { role: "user", content: messageInput }],
          numScenes,
          userId: (await supabase.auth.getUser()).data.user?.id,
        }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const data = await res.json();
      const updatedScenes = [...chat.scenes, ...data.scenes];

      setChats((prev) =>
        prev.map((c) =>
          c.id === chat.id
            ? { ...c, scenes: updatedScenes, messages: [...c.messages, { role: "user", content: messageInput }] }
            : c
        )
      );

      setInputs((prev) => ({ ...prev, [chat.id]: "" }));

      // Generate images in parallel
      await Promise.all(updatedScenes.map((scene: any) => generateImage(scene)));

      scrollToBottom();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateImage = async (scene: any, forceRegenerate = false) => {
    if (!activeChatId) return;

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

  const createNewChat = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("chats")
      .insert([{ 
        title: "New Chat", 
        user_id: user.id  // FIX: change userId to user_id
      }])
      .select()
      .single();

    if (data && !error) {
      setChats(prev => [...prev, { ...data, scenes: [], messages: [] }]);
      setActiveChatId(data.id);
    } else if (error) {
      console.error("Insert chat error:", error.message);
    }
  };

  const deleteChat = async (chatId: number) => {
    if (!confirm("Are you sure you want to delete this chat?")) return;

    const { error } = await supabase
      .from("chats")
      .delete()
      .eq("id", chatId);

    if (!error) {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      setInputs((prev) => {
        const copy = { ...prev };
        delete copy[chatId];
        return copy;
      });
      if (activeChatId === chatId) setActiveChatId(null);
    } else {
      console.error(error);
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-72 border-r border-gray-200 flex flex-col p-4">
        <button
          onClick={createNewChat}
          className="mb-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          New Chat
        </button>

        <div className="flex-1 overflow-y-auto">
          <ul className="space-y-2">
            {chats.map((chat) => (
              <li
                key={chat.id}
                className={`p-2 rounded flex justify-between items-center cursor-pointer transition ${
                  chat.id === activeChatId
                    ? "bg-blue-100 font-semibold"
                    : "hover:bg-gray-100"
                }`}
              >
                <span onClick={() => setActiveChatId(chat.id)}>
                  {chat.title || "Untitled Chat"}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteChat(chat.id);
                  }}
                  className="text-red-500 hover:text-red-700 px-2"
                >
                  🗑️
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col p-6 overflow-y-auto">
        {activeChat ? (
          <>
            <h2 className="text-xl font-bold mb-4">{activeChat.title}</h2>

            {/* Messages & Input */}
            <div className="flex-1 overflow-y-auto mb-4">
              <div className="space-y-2">
                {activeChat.messages.map((msg: any, i: number) => (
                  <div
                    key={i}
                    className={`p-2 rounded max-w-[80%] ${
                      msg.role === "user"
                        ? "bg-green-100 ml-auto"
                        : "bg-gray-200"
                    }`}
                  >
                    {msg.content}
                  </div>
                ))}
                {activeChat.scenes.map((scene: any) => (
                  <div
                    key={scene.sceneNumber}
                    className="bg-white p-4 rounded shadow-sm mt-2"
                  >
                    <p className="font-semibold mb-2">Scene {scene.sceneNumber}</p>
                    <p className="mb-2">{scene.scenePrompt}</p>
                    {scene.imageUrl ? (
                      <img
                        src={scene.imageUrl}
                        alt={`Scene ${scene.sceneNumber}`}
                        className="w-full rounded border"
                      />
                    ) : (
                      <button
                        onClick={() => generateImage(scene, true)}
                        className="mt-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 transition"
                      >
                        Generate Image
                      </button>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="flex items-center space-x-2">
              <input
                type="text"
                className="flex-1 border rounded px-3 py-2"
                value={activeChatId !== null ? (inputs[activeChatId] ?? "") : ""}  // FIX: avoid indexing with null
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage();
                }}
                placeholder="Type a message..."
              />
              <input
                type="number"
                className="w-20 border rounded px-2 py-1"
                value={numScenes}
                min={1}
                onChange={(e) => setNumScenes(Number(e.target.value))}
              />
              <button
                onClick={sendMessage}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                disabled={loading}
              >
                {loading ? "Sending..." : "Send"}
              </button>
            </div>
          </>
        ) : (
          <p className="text-gray-500">Select a chat to view scenes</p>
        )}
      </div>
    </div>
  );
}
