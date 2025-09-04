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
  const [loadingScenes, setLoadingScenes] = useState<Record<string, boolean>>({});

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
    setLoadingScenes((prev) => ({ ...prev, [activeChatId]: true }));

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
        })
        .select()
        .single();

      if (!userMsg) throw new Error("Failed to insert message");

      setChats(prev =>
        prev.map(c =>
          c.id === chat.id ? { ...c, messages: [...c.messages, userMsg] } : c
        )
      );

      setInputs(prev => ({ ...prev, [chat.id]: "" }));

      // Parallel scene generation
      const scenePromises = Array.from({ length: numScenes }, (_, i) => i + 1).map(async (i) => {
        const scenePrompt = `${messageInput} (Scene ${i})`;

        // Insert scene
        const { data: sceneInsert } = await supabase
          .from("scenes")
          .insert({
            chat_id: chat.id,
            sceneNumber: i,
            scenePrompt,
            sceneImagePrompt: scenePrompt,
          })
          .select()
          .single();

        if (!sceneInsert) return null;

        // Call image generation API
        try {
          const response = await fetch("/api/genImage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: scenePrompt,
              chatId: chat.id,
              sceneNumber: i,
              userId: localUser.id,
            }),
          });

          if (!response.ok) return null;
          const { imageUrl } = await response.json();

          await supabase
            .from("scenes")
            .update({ imageUrl })
            .eq("id", sceneInsert.id);

          return { ...sceneInsert, imageUrl };
        } catch (err) {
          console.error(err);
          return null;
        }
      });

      const scenes = await Promise.all(scenePromises);

      setChats(prev =>
        prev.map(c =>
          c.id === chat.id
            ? { ...c, scenes: [...c.scenes, ...scenes.filter(Boolean) as Scene[]] }
            : c
        )
      );
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setLoadingScenes((prev) => ({ ...prev, [activeChatId!]: false }));
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
              {renamingChat === chat.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="w-32"
                  />
                  <Button size="sm" onClick={() => handleRenameChat(chat.id)}>Save</Button>
                </div>
              ) : (
                <>
                  <span className="truncate">{chat.title}</span>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setRenamingChat(chat.id); setRenameValue(chat.title); }}>Rename</Button>
                    <Button size="sm" variant="destructive" onClick={(e) => { e.stopPropagation(); handleDeleteChat(chat.id); }}>Del</Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </ScrollArea>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        <ScrollArea className="flex-1 p-4 space-y-4">
          {activeChat ? (
            <>
              {activeChat.messages.map(msg => (
                <Card key={msg.id} className={`p-2 ${msg.role === "user" ? "bg-blue-50" : "bg-gray-100"}`}>
                  <CardContent>
                    {msg.content}
                  </CardContent>
                </Card>
              ))}

              {/* Scenes */}
              {loadingScenes[activeChat.id] ? (
                <div className="grid grid-cols-3 gap-4 mt-4">
                  {Array.from({ length: numScenes }).map((_, i) => (
                    <div key={i} className="h-40 w-full bg-gray-200 animate-pulse rounded" />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-4 mt-4">
                  {activeChat.scenes.map(scene => (
                    <div key={scene.id} className="border rounded overflow-hidden">
                      {scene.imageUrl ? (
                        <img src={scene.imageUrl} alt={scene.scenePrompt} className="w-full h-40 object-cover" />
                      ) : (
                        <div className="h-40 w-full bg-gray-200 flex items-center justify-center">Loading...</div>
                      )}
                      <div className="p-2 text-sm">{scene.scenePrompt}</div>
                    </div>
                  ))}
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          ) : (
            <div className="p-4 text-gray-500">Select or create a chat to start messaging.</div>
          )}
        </ScrollArea>

        {/* Input */}
        {activeChat && (
          <div className="p-4 border-t flex gap-2">
            <TextareaAutosize
              minRows={1}
              maxRows={4}
              value={inputs[activeChat.id] || ""}
              onChange={(e) => handleInputChange(e.target.value)}
              className="flex-1 border rounded p-2 resize-none"
              placeholder="Type your message..."
            />
            <Button onClick={sendMessage} disabled={loading}>
              {loading ? "Sending..." : "Send"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
