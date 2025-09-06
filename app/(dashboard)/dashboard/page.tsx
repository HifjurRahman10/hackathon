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
  scene_number: number;
  scene_prompt: string;
  scene_image_prompt: string;
  character_description?: string | null;
  image_url?: string | null;
  created_at: string;
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

  // Debug logging
  useEffect(() => {
    console.log("Current chats with IDs:", chats.map(chat => ({
      id: chat.id,
      idType: typeof chat.id,
      title: chat.title
    })));
    if (activeChatId) console.log("Active chat ID:", activeChatId, "Type:", typeof activeChatId);
  }, [chats, activeChatId]);

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
        .select(`
          *,
          messages(*),
          scenes(*)
        `)
        .eq("user_id", localUser.id)
        .order("created_at", { ascending: false });

      if (chatData) {
        const savedInputs: Record<string, string> = {};
        chatData.forEach((c: any) => {
          savedInputs[c.id] = "";
          c.messages = c.messages.sort((a: any, b: any) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          c.scenes = c.scenes.sort((a: any, b: any) => a.scene_number - b.scene_number);
        });
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
    );

    channel.subscribe();

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
        prev.map(c => c.id === chat.id ? { ...c, messages: [...c.messages, userMsg] } : c)
      );
      setInputs(prev => ({ ...prev, [chat.id]: "" }));

      const requestBody = {
        chatId: chat.id,
        messages: [...chat.messages.map(m => ({ role: m.role, content: m.content })), { role: "user", content: messageInput }],
        numScenes: numScenes,
      };

      const chatResponse = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (!chatResponse.ok) {
        const errorData = await chatResponse.json();
        throw new Error(errorData.error || "Failed to generate scenes");
      }

      const { scenes } = await chatResponse.json();

      const { data: createdScenes } = await supabase
        .from("scenes")
        .select("*")
        .eq("chat_id", chat.id)
        .order("scene_number");

      if (createdScenes) {
        setChats(prev =>
          prev.map(c => c.id === chat.id ? { ...c, scenes: createdScenes } : c)
        );

        // Generate images in parallel
        const imagePromises = createdScenes.map(async (scene: Scene) => {
          try {
            const response = await fetch("/api/genImage", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: scene.scene_image_prompt,
                chatId: chat.id,
                sceneNumber: scene.scene_number,
                userId: localUser.id,
              }),
            });

            if (!response.ok) return scene;
            const { imageUrl } = await response.json();

            await supabase.from("scenes").update({ image_url: imageUrl }).eq("id", scene.id);

            return { ...scene, image_url: imageUrl };
          } catch {
            return scene;
          }
        });

        const updatedScenes = await Promise.all(imagePromises);
        setChats(prev =>
          prev.map(c => c.id === chat.id ? { ...c, scenes: updatedScenes } : c)
        );
      }
    } catch (err) {
      console.error(err);
      alert(`Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
    setChats(prev =>
      prev.map(c => c.id === chatId ? { ...c, title: renameValue } : c)
    );
    setRenamingChat(null);
    setRenameValue("");
  };

  // Combine messages + scenes chronologically
  const getChatContent = (chat: Chat) => {
    const items: Array<{ type: 'message' | 'scene', data: Message | Scene, timestamp: string }> = [];
    chat.messages.forEach(msg => items.push({ type: 'message', data: msg, timestamp: msg.created_at }));
    chat.scenes.forEach(scene => items.push({ type: 'scene', data: scene, timestamp: scene.created_at }));
    items.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return items;
  };

  return (
    <div className="flex h-screen w-full bg-gray-50 text-gray-900">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <Button onClick={() => createNewChat()} className="w-full mb-2">+ New Chat</Button>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium">Scenes:</label>
            <Input
              type="number"
              min="1"
              max="10"
              value={numScenes}
              onChange={(e) => setNumScenes(Number(e.target.value))}
              className="w-20"
            />
          </div>
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
      <div className="flex-1 flex flex-col max-h-screen">
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-4">
              {activeChat ? (
                <>
                  {getChatContent(activeChat).map((item) => {
                    if (item.type === 'message') {
                      const msg = item.data as Message;
                      return (
                        <Card key={`msg-${msg.id}`} className={`p-4 ${msg.role === "user" ? "bg-blue-50 border-blue-200" : "bg-gray-100"}`}>
                          <CardContent className="p-0">
                            <div className="flex items-start gap-3">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold ${msg.role === "user" ? "bg-blue-500" : "bg-gray-500"}`}>
                                {msg.role === "user" ? "U" : "AI"}
                              </div>
                              <div className="flex-1">
                                <div className="text-sm text-gray-600 mb-1">
                                  {msg.role === "user" ? "You" : "Assistant"} • {new Date(msg.created_at).toLocaleTimeString()}
                                </div>
                                <div className="text-gray-900">{msg.content}</div>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    } else {
                      const scene = item.data as Scene;
                      return (
                        <Card key={`scene-${scene.id}`} className="p-4 bg-purple-50 border-purple-200">
                          <CardContent className="p-0">
                            <div className="flex items-start gap-4">
                              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-purple-500 text-white text-sm font-semibold">
                                {scene.scene_number}
                              </div>
                              <div className="flex-1">
                                <div className="text-sm text-gray-600 mb-2">
                                  Scene {scene.scene_number} • {new Date(scene.created_at).toLocaleTimeString()}
                                </div>
                                <div className="grid md:grid-cols-2 gap-4">
                                  <div>
                                    <h4 className="font-semibold text-purple-800 mb-2">Story</h4>
                                    <p className="text-gray-900 text-sm leading-relaxed">{scene.scene_prompt}</p>
                                  </div>
                                  <div>
                                    <h4 className="font-semibold text-purple-800 mb-2">Visual</h4>
                                    {scene.image_url ? (
                                      <img
                                        src={scene.image_url}
                                        alt={`Scene ${scene.scene_number}`}
                                        className="w-full h-auto max-h-64 object-contain rounded-lg shadow-sm bg-white"
                                      />
                                    ) : (
                                      <div className="w-full h-48 bg-gray-200 rounded-lg flex items-center justify-center text-gray-500">
                                        {loadingScenes[activeChat.id] ? "Generating..." : "Loading..."}
                                      </div>
                                    )}
                                    <p className="text-xs text-gray-600 mt-2 italic">{scene.scene_image_prompt}</p>
                                  </div>
                                </div>
                                {scene.character_description && (
                                  <div className="mt-3 pt-3 border-t border-purple-200">
                                    <h4 className="font-semibold text-purple-800 mb-1 text-sm">Characters</h4>
                                    <p className="text-xs text-gray-700">{scene.character_description}</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    }
                  })}
                  {loadingScenes[activeChat.id] && (
                    <Card className="p-4 bg-yellow-50 border-yellow-200">
                      <CardContent className="p-0">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center bg-yellow-500 text-white text-sm font-semibold animate-pulse">
                            AI
                          </div>
                          <div>
                            <div className="text-sm text-yellow-800 font-medium">Generating story scenes...</div>
                            <div className="text-xs text-yellow-600">Creating {numScenes} scenes with images</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  <div ref={messagesEndRef} />
                </>
              ) : (
                <div className="p-4 text-gray-500 text-center">
                  <div className="max-w-md mx-auto">
                    <h3 className="text-lg font-semibold mb-2">Welcome to StoryMaker AI</h3>
                    <p className="mb-4">Create immersive stories with AI-generated scenes and images. Select or create a chat to start your storytelling journey.</p>
                    <Button onClick={() => createNewChat()}>Start New Story</Button>
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {activeChat && (
          <div className="p-4 border-t bg-white flex gap-2">
            <TextareaAutosize
              minRows={1}
              maxRows={4}
              value={inputs[activeChat.id] || ""}
              onChange={(e) => handleInputChange(e.target.value)}
              className="flex-1 border rounded p-3 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Describe your story idea..."
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button
              onClick={sendMessage}
              disabled={loading || !inputs[activeChat.id]?.trim()}
              className="px-6"
            >
              {loading ? "Creating..." : "Generate Story"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
