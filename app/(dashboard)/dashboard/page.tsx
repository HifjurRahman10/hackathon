"use client";

import { useEffect, useRef, useState } from "react";
import TextareaAutosize from "react-textarea-autosize";
import { sb } from "@/lib/auth/supabase-browser";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

const supabase = sb();

type Message = {
  id: string;
  chat_id: string;
  user_id: string;
  role: string;
  content: string;
  created_at: string;
};

type Scene = {
  id: string;
  chat_id: string;
  sceneNumber: number;
  scenePrompt: string;
  sceneImagePrompt: string;
  imageUrl?: string | null;
};

type Chat = {
  id: string;
  title: string;
  created_at: string;
  messages: Message[];
  scenes: Scene[];
};

export default function DashboardPage() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [numScenes, setNumScenes] = useState(3);
  const [loading, setLoading] = useState(false);
  const [renamingChat, setRenamingChat] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, activeChatId]);

  // Fetch chats on mount
  useEffect(() => {
    const fetchChats = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let { data: localUser } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_id", user.id)
        .single();

      if (!localUser) {
        const { data: newUser } = await supabase
          .from("users")
          .insert({
            supabase_id: user.id,
            email: user.email || "",
            name: user.user_metadata?.full_name || user.email?.split("@")[0] || "",
            role: "member",
          })
          .select("id")
          .single();
        localUser = newUser!;
      }

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

  // Realtime listener for scene updates
  useEffect(() => {
    const channel = supabase.channel("scene-updates").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "scenes" },
      (payload: any) => {
        const updatedScene = payload.new as Scene;
        setChats((prev) =>
          prev.map((c) => ({
            ...c,
            scenes: c.id === updatedScene.chat_id
              ? c.scenes.map((s) => s.id === updatedScene.id ? updatedScene : s)
              : c.scenes
          }))
        );
      }
    ).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const activeChat = chats.find((c) => c.id === activeChatId);

  const handleInputChange = (value: string) => {
    if (!activeChatId) return;
    setInputs((prev) => ({ ...prev, [activeChatId]: value }));
  };

  const createNewChat = async (prompt?: string) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
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
          title: prompt || "New Chat",
          user_id: localUser.id,
        })
        .select()
        .single();

      if (newChat) {
        setChats((prev) => [{ ...newChat, messages: [], scenes: [] }, ...prev]);
        setActiveChatId(newChat.id);
        setInputs((prev) => ({ ...prev, [newChat.id]: prompt || "" }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const sendMessage = async () => {
    if (!activeChatId) return;
    const messageInput = inputs[activeChatId]?.trim();
    if (!messageInput) return;

    setLoading(true);

    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error("User not found");

      const { data: localUser } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_id", authUser.id)
        .single();

      if (!localUser) throw new Error("Local user not found");

      const chat = chats.find((c) => c.id === activeChatId);
      if (!chat) throw new Error("Chat not found");

      // Insert user message
      const { data: userMsg } = await supabase
        .from("messages")
        .insert({
          chat_id: chat.id,
          user_id: localUser.id,
          role: "user",
          content: messageInput,
        } as any)
        .select()
        .single();

      if (!userMsg) throw new Error("Failed to insert message");

      // Update local state immediately
      setChats(prev =>
        prev.map(c =>
          c.id === chat.id ? { ...c, messages: [...c.messages, userMsg] } : c
        )
      );

      setInputs(prev => ({ ...prev, [chat.id]: "" }));

      // Generate scenes
      for (let i = 1; i <= numScenes; i++) {
        const scenePrompt = `${messageInput} (Scene ${i})`;

        // Insert scene first
        const { data: sceneInsert } = await supabase
          .from("scenes")
          .insert({
            chat_id: chat.id,
            sceneNumber: i,
            scenePrompt,
            sceneImagePrompt: scenePrompt,
          } as any)
          .select()
          .single();

        if (!sceneInsert) continue;

        // Call image generation API
        const response = await fetch("/api/genImage", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: scenePrompt, sceneId: sceneInsert.id }),
        });

        if (!response.ok) continue;
        const { imageUrl } = await response.json();

        // Update scene with imageUrl
        await supabase
          .from("scenes")
          .update({ imageUrl })
          .eq("id", sceneInsert.id);
      }

      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteChat = async (chatId: string) => {
    await supabase.from("chats").delete().eq("id", chatId);
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) setActiveChatId(chats[0]?.id || null);
  };

  const handleRenameChat = async (chatId: string) => {
    if (!renameValue.trim()) return;
    await supabase.from("chats").update({ title: renameValue }).eq("id", chatId);
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, title: renameValue } : c))
    );
    setRenamingChat(null);
    setRenameValue("");
  };

  return (
    <div className="flex h-screen w-full bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <Button onClick={() => createNewChat()} className="w-full">
            + New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {chats.map(chat => (
            <div
              key={chat.id}
              className={`p-3 cursor-pointer flex justify-between items-center rounded hover:bg-gray-100 transition ${activeChatId === chat.id ? "bg-blue-50 border-l-4 border-blue-500" : ""}`}
              onClick={() => setActiveChatId(chat.id)}
            >
              <div className="flex-1 truncate">
                {renamingChat === chat.id ? (
                  <div className="flex gap-2">
                    <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus className="w-full"/>
                    <Button onClick={() => handleRenameChat(chat.id)}>Save</Button>
                  </div>
                ) : (
                  <span className="truncate">{chat.title}</span>
                )}
              </div>
              {renamingChat !== chat.id && (
                <div className="relative group">
                  <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100 transition">⋮</Button>
                  <div className="absolute right-0 mt-1 w-32 bg-white border rounded shadow-lg opacity-0 group-hover:opacity-100 transition">
                    <button className="w-full p-2 text-left hover:bg-gray-100" onClick={() => { setRenamingChat(chat.id); setRenameValue(chat.title); }}>Rename</button>
                    <button className="w-full p-2 text-left hover:bg-gray-100" onClick={() => handleDeleteChat(chat.id)}>Delete</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Main */}
      <div className="flex-1 flex flex-col relative">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b bg-white">
          <h2 className="font-semibold text-lg">{activeChat?.title || "Select a chat"}</h2>
          <Input type="number" min={1} max={99} value={numScenes} onChange={(e) => {
            let val = e.target.value.trim();
            if (/^0+/.test(val)) val = String(Number(val));
            const num = Number(val);
            if (!isNaN(num) && num >= 1 && num <= 99) setNumScenes(num);
          }} className="w-20"/>
        </div>

        {/* Chat & Scenes */}
        <ScrollArea className="flex-1 p-4 space-y-4 overflow-y-auto flex flex-col justify-end">
          {activeChat?.messages?.length ? (
            activeChat.messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`px-4 py-2 max-w-xs break-words transition-all ${msg.role === "user" ? "bg-blue-600 text-white rounded-xl" : "bg-gray-100 text-gray-900 rounded-xl"}`}>
                  {msg.content}
                </div>
              </div>
            ))
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              Start by creating a new chat or selecting one
            </div>
          )}

          {activeChat?.scenes?.map(scene => (
            <Card key={scene.sceneNumber}>
              <CardContent>
                <p className="font-semibold mb-2">Scene {scene.sceneNumber}</p>
                <p className="mb-2">{scene.scenePrompt}</p>
                {scene.imageUrl ? (
                  <img src={scene.imageUrl} alt={`Scene ${scene.sceneNumber}`} className="rounded-lg border"/>
                ) : (
                  <p className="italic text-gray-400">Image generating...</p>
                )}
              </CardContent>
            </Card>
          ))}

          <div ref={messagesEndRef}/>
        </ScrollArea>

        {/* Input */}
        <div className="w-full flex justify-center p-4 border-t bg-white">
          <div className="flex items-end gap-2 w-full max-w-3xl">
            <TextareaAutosize
              minRows={1}
              maxRows={6}
              className="flex-1 resize-none px-4 py-3 rounded-md border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none placeholder-gray-400 text-gray-900 shadow-sm overflow-auto"
              placeholder={activeChat ? "Write your story..." : "Start by creating a chat..."}
              value={activeChatId ? inputs[activeChatId] : ""}
              onChange={(e) => handleInputChange(e.target.value)}
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button
              onClick={sendMessage}
              disabled={!activeChatId || !inputs[activeChatId]?.trim() || loading}
              className="flex-shrink-0 px-6 py-3 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md transition"
            >
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
