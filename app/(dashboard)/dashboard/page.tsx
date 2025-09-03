"use client";

import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/auth/supabase-browser";
import {
  Input
} from "@/components/ui/input";
import {
  Button
} from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent
} from "@/components/ui/card";
import {
  ScrollArea
} from "@/components/ui/scroll-area";
import {
  Separator
} from "@/components/ui/separator";

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
  const [numScenes, setNumScenes] = useState(3);
  const [loading, setLoading] = useState(false);
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

  const activeChat = chats.find((c) => c.id === activeChatId);

  const handleInputChange = (value: string) => {
    if (!activeChatId) return;
    setInputs((prev) => ({ ...prev, [activeChatId]: value }));
  };

  // Scene count input handler
  const handleSceneCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value.trim();
    if (/^0+/.test(val)) val = String(Number(val));
    const num = Number(val);
    if (!isNaN(num) && num >= 1 && num <= 99) setNumScenes(num);
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-80 border-r bg-muted/30 flex flex-col">
        <div className="p-4 border-b">
          <Button onClick={() => {}} className="w-full">
            + New Chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setActiveChatId(chat.id)}
              className={`p-4 cursor-pointer transition-colors ${
                activeChatId === chat.id
                  ? "bg-primary/10 border-l-4 border-primary"
                  : "hover:bg-accent"
              }`}
            >
              <p className="font-medium truncate">{chat.title}</p>
              <p className="text-xs text-muted-foreground">
                {new Date(chat.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </ScrollArea>
      </aside>

      {/* Main */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b">
          <h2 className="font-semibold text-lg">
            {activeChat?.title || "Select a chat"}
          </h2>
          <Input
            type="number"
            min={1}
            max={99}
            value={numScenes}
            onChange={handleSceneCountChange}
            className="w-20"
          />
        </div>

        {/* Messages + Scenes */}
        <ScrollArea className="flex-1 p-4 space-y-4">
          {activeChat?.messages?.map((msg, i) => (
            <div
              key={i}
              className={`flex ${
                msg.role === "user" ? "justify-end" : "justify-start"
              }`}
            >
              <div
                className={`px-4 py-2 rounded-2xl text-sm shadow ${
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
                    Image generating...
                  </p>
                )}
              </CardContent>
            </Card>
          ))}

          <div ref={messagesEndRef} />
        </ScrollArea>

        <Separator />

        {/* Input area */}
        <div className="flex p-4 gap-2">
          <Input
            placeholder="Write your story..."
            value={activeChatId ? inputs[activeChatId] : ""}
            onChange={(e) => handleInputChange(e.target.value)}
            disabled={loading}
          />
          <Button
            onClick={() => {}}
            disabled={!activeChatId || !inputs[activeChatId]?.trim() || loading}
          >
            Send
          </Button>
        </div>
      </main>
    </div>
  );
}
