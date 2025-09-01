"use client";

import { useEffect, useState } from "react";
import { sb } from "@/lib/auth/supabase-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trash2 } from "lucide-react";

const supabase = sb();

export default function DashboardPage() {
  const [chats, setChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [scenes, setScenes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState("");

  // Fetch chats on mount
  useEffect(() => {
    fetchChats();
  }, []);

  // Fetch scenes when activeChatId changes
  useEffect(() => {
    if (activeChatId) fetchScenes(activeChatId);
  }, [activeChatId]);

  const fetchChats = async () => {
    const res = await fetch("/api/chat", { method: "GET" });
    const data = await res.json();

    if (!data || data.length === 0) {
      // Auto-create chat if none exist
      const newChat = await fetch("/api/chat", { method: "POST" });
      const created = await newChat.json();
      setChats([created]);
      setActiveChatId(created.id);
    } else {
      setChats(data);
      setActiveChatId(data[0].id);
    }
  };

  const fetchScenes = async (chatId: string) => {
    setLoading(true);
    const res = await fetch(`/api/scene?chatId=${chatId}`, { method: "GET" });
    const data = await res.json();
    setScenes(data || []);
    setLoading(false);
  };

  const handleSend = async () => {
    if (!input.trim() || !activeChatId) return;

    setLoading(true);

    const res = await fetch("/api/scene", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: activeChatId, prompt: input }),
    });

    const data = await res.json();

    if (data) {
      setScenes((prev) => [...prev, data]); // append new scene
    }

    setInput(""); // clear input after sending
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    await fetch(`/api/chat?chatId=${chatId}`, { method: "DELETE" });
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      if (chats.length > 1) {
        setActiveChatId(chats.find((c) => c.id !== chatId)?.id || null);
      } else {
        setActiveChatId(null);
        // Auto-create a new chat after deletion if none left
        const newChat = await fetch("/api/chat", { method: "POST" });
        const created = await newChat.json();
        setChats([created]);
        setActiveChatId(created.id);
      }
    }
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 border-r bg-gray-50 flex flex-col">
        <div className="p-4 font-semibold text-lg">Your Chats</div>
        <div className="flex-1 overflow-y-auto">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center justify-between px-4 py-2 cursor-pointer hover:bg-gray-100 ${
                activeChatId === chat.id ? "bg-gray-200 font-medium" : ""
              }`}
              onClick={() => setActiveChatId(chat.id)}
            >
              <span className="truncate">{chat.title || "Untitled Chat"}</span>
              <Trash2
                className="w-4 h-4 text-red-500 opacity-0 group-hover:opacity-100 transition"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteChat(chat.id);
                }}
              />
            </div>
          ))}
        </div>
        <div className="p-4">
          <Button
            className="w-full"
            onClick={async () => {
              const res = await fetch("/api/chat", { method: "POST" });
              const newChat = await res.json();
              setChats((prev) => [newChat, ...prev]);
              setActiveChatId(newChat.id);
            }}
          >
            + New Chat
          </Button>
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col">
        {/* Scenes */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading && <div>Loading...</div>}
          {!loading && scenes.length === 0 && (
            <div className="text-gray-500">No scenes yet. Start typing below.</div>
          )}
          {scenes.map((scene, idx) => (
            <Card key={scene.id || idx} className="shadow-sm">
              <CardContent className="p-4">
                <div className="font-medium text-gray-700 mb-2">
                  Scene {idx + 1}
                </div>
                <p className="text-gray-900">{scene.scene_prompt}</p>
                {scene.image_url && (
                  <img
                    src={scene.image_url}
                    alt={`Scene ${idx + 1}`}
                    className="mt-3 rounded-lg border"
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Input */}
        <div className="border-t p-4">
          <input
            className="w-full rounded-xl border px-4 py-3 focus:outline-none focus:ring focus:ring-blue-400"
            placeholder="Type your scene prompt..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={loading}
          />
        </div>
      </div>
    </div>
  );
}
