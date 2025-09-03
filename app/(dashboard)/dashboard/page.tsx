"use client";

import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/auth/supabase-browser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

const supabase = sb();

type Scene = {
  sceneNumber: number;
  scenePrompt: string;
  sceneImagePrompt: string;
  characterDescription?: string;
  imageUrl?: string | null;
  pending?: boolean;
  error?: boolean;
};

type Chat = {
  id: string;
  title: string;
  created_at: string;
  messages: { role: string; content: string }[];
  scenes: Scene[];
};

export default function DashboardPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [numScenes, setNumScenes] = useState(3);
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, activeChatId]);

  // Fetch chats
  useEffect(() => {
    const fetchChats = async () => {
      const { data } = await supabase.auth.getUser();
      const authUser = data.user;
      if (!authUser) return;

      const { data: localUser } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_id", authUser.id)
        .single();

      if (!localUser) return;

      const { data: chatData } = await supabase
        .from("chats")
        .select("*, messages(*), scenes(*)")
        .eq("user_id", localUser.id)
        .order("created_at", { ascending: false });

      if (chatData) {
        const savedInputs: Record<string, string> = {};
        chatData.forEach((c: any) => (savedInputs[c.id] = ""));
        setInputs(savedInputs);
        setChats(chatData);
        if (chatData.length) setActiveChatId(chatData[0].id);
      }
    };

    fetchChats();
  }, []);

  const activeChat = chats.find((c) => c.id === activeChatId);

  const handleInputChange = (value: string) => {
    if (!activeChatId) return;
    setInputs((prev) => ({ ...prev, [activeChatId]: value }));
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
      inputRef.current.style.height = inputRef.current.scrollHeight + "px";
    }
  };

  const createNewChat = async (title = "New Chat") => {
    const { data } = await supabase.auth.getUser();
    const authUser = data.user;
    if (!authUser) return;

    let { data: localUser } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_id", authUser.id)
      .single();

    if (!localUser) {
      const { data: newUser } = await supabase
        .from("users")
        .insert({
          supabase_id: authUser.id,
          email: authUser.email || "",
          name: authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "",
          role: "member",
        })
        .select("id")
        .single();
      localUser = newUser!;
    }

    const { data: newChat } = await supabase
      .from("chats")
      .insert({
        title,
        user_id: localUser.id,
      })
      .select()
      .single();

    if (newChat) {
      setChats((prev) => [{ ...newChat, messages: [], scenes: [] }, ...prev]);
      setActiveChatId(newChat.id);
      setInputs((prev) => ({ ...prev, [newChat.id]: "" }));
    }
  };

  const sendMessage = async () => {
    if (!activeChatId) return;
    const messageInput = inputs[activeChatId ?? ""]?.trim();
    if (!messageInput) return;

    setLoading(true);
    try {
      const chat = chats.find((c) => c.id === activeChatId);
      if (!chat) return;

      const { data } = await supabase.auth.getUser();
      const authUser = data.user;
      if (!authUser) return;

      const { data: userMsg, error: msgError } = await supabase
        .from("messages")
        .insert({
          chat_id: chat.id,
          user_id: authUser.id,
          role: "user",
          content: messageInput,
        })
        .select()
        .single();

      if (msgError) console.error("Failed to save user message:", msgError);

      // Call chat API
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          messages: [...chat.messages, { role: "user", content: messageInput }],
          numScenes,
          userId: authUser.id,
        }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const dataResp = await res.json();
      const updatedScenes = [...chat.scenes, ...dataResp.scenes];

      // Generate images in parallel & update DB
      await Promise.all(
        updatedScenes.map(async (scene) => {
          const imgRes = await fetch("/api/genImage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: scene.sceneImagePrompt,
              chatId: chat.id,
              sceneNumber: scene.sceneNumber,
              userId: authUser.id,
            }),
          });

          if (!imgRes.ok) return;
          const { imageUrl } = await imgRes.json();
          scene.imageUrl = imageUrl;

          await supabase.from("scenes").update({ imageUrl }).eq("chat_id", chat.id).eq("scene_number", scene.sceneNumber);
        })
      );

      // Update state
      setChats((prev) =>
        prev.map((c) =>
          c.id === chat.id
            ? {
                ...c,
                messages: [...c.messages, { role: "user", content: messageInput }],
                scenes: updatedScenes,
              }
            : c
        )
      );

      setInputs((prev) => ({ ...prev, [chat.id]: "" }));
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSceneCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.trim();
    if (/^0+/.test(val)) val = String(Number(val));
    const num = Number(val);
    if (!isNaN(num) && num >= 1 && num <= 99) setNumScenes(num);
  };

  const inputPlaceholder = activeChat ? "Write your story..." : "Start your first chat...";

  return (
    <div className="flex h-screen w-full">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <Button onClick={() => createNewChat()} className="w-full">
            New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setActiveChatId(chat.id)}
              className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${activeChatId === chat.id ? "bg-blue-50 border-blue-200" : ""}`}
            >
              <h3 className="truncate font-medium">{chat.title}</h3>
              <p className="text-sm text-gray-500">{new Date(chat.created_at).toLocaleDateString()}</p>
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="font-bold">{activeChat?.title || "Select a chat"}</h2>
          <Input type="number" min={1} max={99} value={numScenes} onChange={handleSceneCountChange} className="w-20" />
        </div>

        <ScrollArea className="flex-1 p-4 space-y-4 overflow-y-auto">
          {activeChat?.messages?.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`px-4 py-2 rounded-lg max-w-xs ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"}`}>
                {msg.content}
              </div>
            </div>
          ))}

          {activeChat?.scenes?.map((scene) => (
            <Card key={scene.sceneNumber}>
              <CardContent>
                <p className="font-semibold mb-2">Scene {scene.sceneNumber}</p>
                <p className="mb-2">{scene.scenePrompt}</p>
                {scene.imageUrl ? (
                  <img src={scene.imageUrl} alt={`Scene ${scene.sceneNumber}`} className="rounded-lg border" />
                ) : (
                  <p className="italic text-gray-400">Image generating...</p>
                )}
              </CardContent>
            </Card>
          ))}

          <div ref={messagesEndRef} />
        </ScrollArea>

        {/* Input */}
        <div className="p-4 border-t bg-white flex items-end gap-2 sticky bottom-0">
          <textarea
            ref={inputRef}
            placeholder={inputPlaceholder}
            value={activeChatId ? inputs[activeChatId ?? ""] : ""}
            onChange={(e) => handleInputChange(e.target.value)}
            className="flex-1 resize-none rounded-full border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={1}
            disabled={loading}
          />
          <Button onClick={sendMessage} disabled={!activeChatId || !inputs[activeChatId ?? ""]?.trim() || loading}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
