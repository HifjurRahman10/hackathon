"use client";

import { useEffect, useRef, useState } from "react";
import { sb } from "@/lib/auth/supabase-browser";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";

const supabase = sb();

type Scene = {
  sceneNumber: number;
  scenePrompt: string;
  sceneImagePrompt: string;
  characterDescription?: string;
  imageUrl?: string | null;
};

type Message = {
  role: string;
  content: string;
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

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [chatToRename, setChatToRename] = useState<Chat | null>(null);
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chats, activeChatId]);

  // Fetch chats on mount
  useEffect(() => {
    const fetchChats = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id) return;

      const { data: localUser } = await supabase
        .from("users")
        .select("id")
        .eq("supabase_id", user.id)
        .single();

      if (!localUser?.id) return;

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

  const handleInputChange = (value: string) => {
    if (!activeChatId) {
      setInputs((prev) => ({ ...prev, temp: value }));
    } else {
      setInputs((prev) => ({ ...prev, [activeChatId]: value }));
    }
  };

  const createNewChat = async (title = "New Chat") => {
    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser?.id) return;

    let { data: localUser } = await supabase
      .from("users")
      .select("id")
      .eq("supabase_id", authUser.id)
      .single();

    if (!localUser?.id) {
      const { data: newUser } = await supabase
        .from("users")
        .insert({
          supabase_id: authUser.id,
          email: authUser.email || "",
          name:
            authUser.user_metadata?.full_name ||
            authUser.email?.split("@")[0] ||
            "",
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

    if (newChat?.id) {
      setChats((prev) => [
        { ...newChat, messages: [], scenes: [] },
        ...prev,
      ]);
      setActiveChatId(newChat.id);
      setInputs((prev) => ({ ...prev, [newChat.id]: "" }));
    }
  };

  const sendMessage = async () => {
    const messageInput =
      activeChatId && inputs[activeChatId]
        ? inputs[activeChatId].trim()
        : inputs["temp"]?.trim();

    if (!messageInput) return;

    setLoading(true);

    try {
      let chat = activeChat;
      if (!chat && messageInput) {
        // create chat on first message
        await createNewChat(messageInput);
        chat = chats.find((c) => c.id === activeChatId);
        if (!chat) return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user?.id || !chat?.id) return;

      // Save user message
      const { data: userMsg } = await supabase
        .from("messages")
        .insert({
          chat_id: chat.id,
          user_id: user.id,
          role: "user",
          content: messageInput,
        })
        .select()
        .single();

      if (!userMsg) throw new Error("Failed to save message");

      // Call Chat API
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          messages: [...chat.messages, { role: "user", content: messageInput }],
          numScenes,
          userId: user.id,
        }),
      });

      if (!res.ok) throw new Error("Chat API failed");
      const data = await res.json();

      const updatedScenes: Scene[] = data.scenes;

      // Parallel image generation
      await Promise.all(
        updatedScenes.map(async (scene) => {
          const imageRes = await fetch("/api/genImage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: scene.sceneImagePrompt,
              chatId: chat?.id,
              sceneNumber: scene.sceneNumber,
              userId: user.id,
              force: false,
            }),
          });
          if (!imageRes.ok) return;
          const { imageUrl } = await imageRes.json();
          scene.imageUrl = imageUrl;

          // Update DB
          await supabase.from("scenes").insert({
            chat_id: chat?.id,
            scene_number: scene.sceneNumber,
            scene_prompt: scene.scenePrompt,
            scene_image_prompt: scene.sceneImagePrompt,
            character_description: scene.characterDescription || null,
            image_url: imageUrl,
          });
        })
      );

      // Update state
      setChats((prev) =>
        prev.map((c) =>
          c.id === chat?.id
            ? {
                ...c,
                messages: [...c.messages, { role: "user", content: messageInput }],
                scenes: [...c.scenes, ...updatedScenes],
              }
            : c
        )
      );

      if (activeChatId) setInputs((prev) => ({ ...prev, [activeChatId]: "" }));
      else setInputs((prev) => ({ ...prev, temp: "" }));

      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const openRenameModal = (chat: Chat) => {
    setChatToRename(chat);
    setRenameValue(chat.title);
    setRenameModalOpen(true);
  };

  const confirmRename = async () => {
    if (!chatToRename) return;
    await supabase
      .from("chats")
      .update({ title: renameValue })
      .eq("id", chatToRename.id);
    setChats((prev) =>
      prev.map((c) => (c.id === chatToRename.id ? { ...c, title: renameValue } : c))
    );
    setRenameModalOpen(false);
  };

  const openDeleteModal = (chat: Chat) => {
    setChatToDelete(chat);
    setDeleteModalOpen(true);
  };

  const confirmDelete = async () => {
    if (!chatToDelete) return;
    await supabase.from("chats").delete().eq("id", chatToDelete.id);
    setChats((prev) => prev.filter((c) => c.id !== chatToDelete.id));
    setDeleteModalOpen(false);
    if (activeChatId === chatToDelete.id) setActiveChatId(null);
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
<div className="w-80 border-r border-gray-200 flex flex-col">
  <Button onClick={() => createNewChat()} className="m-2">
    + New Chat
  </Button>
  <ScrollArea className="flex-1">
    {chats.map((chat) => (
      <div
        key={chat.id}
        className={`p-2 flex justify-between items-center cursor-pointer ${
          chat.id === activeChatId ? "bg-gray-200" : ""
        }`}
        onClick={() => setActiveChatId(chat.id)}
      >
        {chat.id === chatToRename?.id ? (
          <input
            className="w-full border-b border-gray-400 focus:outline-none"
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onBlur={async () => {
              await supabase
                .from("chats")
                .update({ title: renameValue })
                .eq("id", chat.id);
              setChats((prev) =>
                prev.map((c) =>
                  c.id === chat.id ? { ...c, title: renameValue } : c
                )
              );
              setChatToRename(null);
            }}
            onKeyDown={async (e) => {
              if (e.key === "Enter") {
                (e.target as HTMLInputElement).blur();
              }
            }}
            autoFocus
          />
        ) : (
          <>
            <span>{chat.title}</span>
            <DropdownMenu>
              <DropdownMenuTrigger>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem
                  onClick={() => {
                    setChatToRename(chat);
                    setRenameValue(chat.title);
                  }}
                >
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openDeleteModal(chat)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>
    ))}
  </ScrollArea>
</div>

      {/* Chat area */}
      <div className="flex-1 flex flex-col">
        <ScrollArea className="flex-1 p-4 overflow-y-auto">
          {activeChat?.messages.map((msg, idx) => (
            <Card key={idx} className="mb-2">
              <CardContent>
                <strong>{msg.role === "user" ? "You" : "AI"}:</strong>{" "}
                {msg.content}
              </CardContent>
            </Card>
          ))}
          <div ref={messagesEndRef} />
        </ScrollArea>

        {/* Input area */}
        <div
          className={`p-4 border-t border-gray-200 ${
            activeChatId || inputs["temp"] ? "" : "flex justify-center"
          }`}
        >
          <textarea
            ref={inputRef}
            className="w-full max-w-3xl p-3 rounded-full border border-gray-300 resize-none focus:outline-none focus:ring focus:ring-blue-300"
            rows={1}
            placeholder="Type a message..."
            value={activeChatId ? inputs[activeChatId] : inputs["temp"] || ""}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
          />
        </div>
      </div>

      {/* Rename modal */}
      <Dialog open={renameModalOpen} onOpenChange={setRenameModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Chat</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            placeholder="New chat title"
          />
          <DialogFooter>
            <Button onClick={confirmRename}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete modal */}
      <Dialog open={deleteModalOpen} onOpenChange={setDeleteModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Chat?</DialogTitle>
          </DialogHeader>
          <DialogFooter className="flex justify-between">
            <Button variant="secondary" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
