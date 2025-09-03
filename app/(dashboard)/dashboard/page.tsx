"use client";

import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/auth/supabase-browser";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import TextareaAutosize from "react-textarea-autosize";
import { Input } from "@/components/ui/input";

const supabase = sb();

type Scene = {
  sceneNumber: number;
  scenePrompt: string;
  sceneImagePrompt: string;
  characterDescription?: string;
  imageUrl?: string | null;
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
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, activeChatId]);

  // Fetch chats
  useEffect(() => {
    const fetchChats = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: localUser } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_id", user.id)
        .single();
      if (!localUser) return;

      const { data: chatData } = await supabase
        .from("chats")
        .select("*, messages(*), scenes(*)")
        .eq("user_id", localUser.id)
        .order("created_at", { ascending: false });

      if (chatData) {
        const normalized = chatData.map((c: any) => ({
          ...c,
          messages: c.messages.map((m: any) => ({
            role: m.role,
            content: m.content,
          })),
          scenes: c.scenes.map((s: any) => ({
            sceneNumber: s.scene_number,
            scenePrompt: s.scene_prompt,
            sceneImagePrompt: s.scene_image_prompt,
            characterDescription: s.character_description,
            imageUrl: s.image_url,
          })),
        }));

        const savedInputs: Record<string, string> = {};
        normalized.forEach((c: any) => (savedInputs[c.id] = ""));
        setInputs(savedInputs);
        setChats(normalized);
        if (normalized.length) setActiveChatId(normalized[0].id);
      }
    };

    fetchChats();
  }, []);

  // Realtime subscriptions
  useEffect(() => {
    if (!activeChatId) return;

    const messagesChannel = supabase
      .channel(`messages-${activeChatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${activeChatId}`,
        },
        (payload) => {
          setChats((prev) =>
            prev.map((c) =>
              c.id === activeChatId
                ? {
                    ...c,
                    messages: [
                      ...c.messages,
                      { role: payload.new.role, content: payload.new.content },
                    ],
                  }
                : c
            )
          );
        }
      )
      .subscribe();

    const scenesChannel = supabase
      .channel(`scenes-${activeChatId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "scenes",
          filter: `chat_id=eq.${activeChatId}`,
        },
        (payload) => {
          setChats((prev) =>
            prev.map((c) =>
              c.id === activeChatId
                ? {
                    ...c,
                    scenes: [
                      ...c.scenes,
                      {
                        sceneNumber: payload.new.scene_number,
                        scenePrompt: payload.new.scene_prompt,
                        sceneImagePrompt: payload.new.scene_image_prompt,
                        characterDescription: payload.new.character_description,
                        imageUrl: payload.new.image_url,
                      },
                    ],
                  }
                : c
            )
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(scenesChannel);
    };
  }, [activeChatId]);

  const activeChat = chats.find((c) => c.id === activeChatId);

  const handleInputChange = (value: string) => {
    if (!activeChatId) return;
    setInputs((prev) => ({ ...prev, [activeChatId]: value }));
  };

  // --- New Chat ---
  const createNewChat = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: localUser } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_id", user.id)
        .single();
      if (!localUser) return;

      const { data: newChat } = await supabase
        .from("chats")
        .insert({
          user_id: localUser.id,
          title: "New Chat",
        })
        .select()
        .single();

      if (newChat) {
        setChats((prev) => [{ ...newChat, messages: [], scenes: [] }, ...prev]);
        setActiveChatId(newChat.id);
        setInputs((prev) => ({ ...prev, [newChat.id]: "" }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  // --- Delete Chat ---
  const deleteChat = async (chatId: string) => {
    if (!confirm("Delete this chat?")) return;
    await supabase.from("chats").delete().eq("id", chatId);
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) setActiveChatId(null);
  };

  // --- Rename Chat ---
  const renameChat = async (chatId: string, newTitle: string) => {
    await supabase.from("chats").update({ title: newTitle }).eq("id", chatId);
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, title: newTitle } : c))
    );
    setRenamingChatId(null);
  };

  // --- Send message + scenes + image gen ---
  const sendMessage = async () => {
    if (!activeChatId || !inputs[activeChatId]?.trim()) return;
    setLoading(true);
    const content = inputs[activeChatId];

    try {
      await supabase.from("messages").insert({
        chat_id: activeChatId,
        role: "user",
        content,
      });

      const res = await fetch("/api/sendMessage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: activeChatId, message: content }),
      });
      if (!res.ok) throw new Error("Scene generation failed");
      const { scenes } = await res.json();

      await Promise.all(
        scenes.map(async (s: any, idx: number) => {
          try {
            const imgRes = await fetch("/api/genImage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ prompt: s.sceneImagePrompt }),
            });
            if (!imgRes.ok) throw new Error("Image gen failed");
            const { url } = await imgRes.json();

            await supabase.from("scenes").insert({
              chat_id: activeChatId,
              scene_number: idx + 1,
              scene_prompt: s.scenePrompt,
              scene_image_prompt: s.sceneImagePrompt,
              character_description: s.characterDescription,
              image_url: url,
            });
          } catch (err) {
            console.error("Scene insert failed", err);
          }
        })
      );
    } catch (err) {
      console.error("Send failed", err);
    } finally {
      setInputs((prev) => ({ ...prev, [activeChatId]: "" }));
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-72 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b flex gap-2">
          <Button onClick={createNewChat} className="flex-1">
            + New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`p-4 cursor-pointer transition-colors ${
                activeChatId === chat.id
                  ? "bg-primary/10 border-l-4 border-primary"
                  : "hover:bg-accent"
              }`}
            >
              {renamingChatId === chat.id ? (
                <div className="flex gap-2">
                  <Input
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    className="flex-1"
                  />
                  <Button onClick={() => renameChat(chat.id, renameValue)}>
                    Save
                  </Button>
                  <Button onClick={() => setRenamingChatId(null)}>Cancel</Button>
                </div>
              ) : (
                <div className="flex justify-between items-center">
                  <div
                    onClick={() => setActiveChatId(chat.id)}
                    className="truncate"
                  >
                    {chat.title}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      onClick={() => {
                        setRenamingChatId(chat.id);
                        setRenameValue(chat.title);
                      }}
                    >
                      Rename
                    </Button>
                    <Button size="sm" onClick={() => deleteChat(chat.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </ScrollArea>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeChat?.messages?.map((msg, i) => (
            <div
              key={i}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`px-4 py-2 rounded-2xl text-sm shadow max-w-lg break-words ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-accent text-accent-foreground"
                }`}
              >
                {msg.content}
              </div>
            </div>
          ))}

          {activeChat?.scenes?.map((scene) => (
            <Card key={scene.sceneNumber} className="shadow-sm">
              <CardHeader>
                <CardTitle>Scene {scene.sceneNumber}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm">{scene.scenePrompt}</p>
                {scene.imageUrl ? (
                  <img
                    src={scene.imageUrl}
                    alt={`Scene ${scene.sceneNumber}`}
                    className="rounded-lg border"
                  />
                ) : (
                  <p className="text-muted-foreground italic">
                    Generating image...
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="sticky bottom-0 w-full bg-background p-4 border-t">
          <div className="flex items-end gap-2 max-w-3xl mx-auto">
            <TextareaAutosize
              minRows={1}
              maxRows={6}
              placeholder="Write your story..."
              value={activeChatId ? inputs[activeChatId] : ""}
              onChange={(e) => handleInputChange(e.target.value)}
              disabled={loading}
              className="w-full resize-none rounded-full border px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary text-sm bg-background shadow-sm"
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
              className="rounded-full"
            >
              Send
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
