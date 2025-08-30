'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, MessageCircle, X } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import { createClient } from '@supabase/supabase-js';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type Scene = {
  sceneNumber: number;
  scenePrompt: string;
  sceneImagePrompt: string;
  imageUrl?: string;
};

type Chat = {
  id: number;
  title: string;
  messages: Message[];
  scenes: Scene[];
};

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function VideoDashboard() {
  const bottomRef = useRef<HTMLDivElement>(null);

  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number>(0);
  const [input, setInput] = useState('');
  const [sceneCount, setSceneCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);

  // Load cached chats
  useEffect(() => {
    const stored = localStorage.getItem('videoChats');
    if (stored) {
      setChats(JSON.parse(stored));
      setActiveChatId(JSON.parse(stored)[0]?.id ?? 0);
    } else {
      const initialChat: Chat = { id: 0, title: 'New Chat', messages: [], scenes: [] };
      setChats([initialChat]);
      setActiveChatId(0);
    }
  }, []);

  const activeChat = chats.find((c) => c.id === activeChatId)!;

  // Persist chats
  const saveChats = (newChats: Chat[]) => {
    setChats(newChats);
    try {
      localStorage.setItem('videoChats', JSON.stringify(newChats));
    } catch (err) {
      console.warn('LocalStorage quota exceeded. Consider caching fewer images.');
    }
  };

  const updateChat = (id: number, updates: Partial<Chat>) => {
    const newChats = chats.map((c) => (c.id === id ? { ...c, ...updates } : c));
    saveChats(newChats);
  };

  const startNewChat = () => {
    const newId = Math.max(...chats.map((c) => c.id), -1) + 1;
    const newChat: Chat = { id: newId, title: 'New Chat', messages: [], scenes: [] };
    saveChats([newChat, ...chats]);
    setActiveChatId(newId);
  };

  const deleteChat = () => {
    if (!chatToDelete) return;
    const newChats = chats.filter((c) => c.id !== chatToDelete.id);
    saveChats(newChats);
    if (chatToDelete.id === activeChatId) {
      setActiveChatId(newChats[0]?.id ?? 0);
    }
    setDeleteModalOpen(false);
    setChatToDelete(null);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    // Validate scene count
    if (sceneCount < 1 || sceneCount > 99) {
      alert('Scene count must be between 1 and 99');
      return;
    }

    const newMessage: Message = { role: 'user', content: input };
    const updatedMessages: Message[] = [...activeChat.messages, newMessage];
    updateChat(activeChatId, { messages: updatedMessages, scenes: [] });
    setInput('');
    setLoading(true);

    try {
      // Call Chat API
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, sceneCount }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        updateChat(activeChatId, {
          messages: [...updatedMessages, { role: 'assistant', content: `⚠️ Error: ${error}` }],
        });
        return;
      }

      const data = await res.json();
      const scenes: Scene[] = data.scenes || [];

      // Parallel image generation & upload to Supabase
      const scenesWithImages = await Promise.all(
        scenes.map(async (scene: Scene) => {
          try {
            const imgRes = await fetch('/api/genImage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: scene.sceneImagePrompt }),
            });
            const imgData = await imgRes.json();
            let imageUrl = imgData.imageUrl;

            // Upload to Supabase if not cached
            if (imageUrl) {
              const filename = `scene-${Date.now()}-${scene.sceneNumber}.png`;
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('user_uploads')
                .upload(filename, await (await fetch(imageUrl)).blob(), { upsert: true });

              if (uploadError) console.error(uploadError);
              else {
                // FIXED: Correct destructuring for getPublicUrl
                const { data } = supabase.storage.from('user_uploads').getPublicUrl(filename);
                imageUrl = data.publicUrl;
              }
            }

            return { ...scene, imageUrl };
          } catch (err) {
            console.error('Scene image error:', err);
            return { ...scene, imageUrl: '' };
          }
        })
      );

      updateChat(activeChatId, { scenes: scenesWithImages });
    } catch (err) {
      console.error('Chat API error:', err);
      updateChat(activeChatId, {
        messages: [...updatedMessages, { role: 'assistant', content: '⚠️ Network error. Try again.' }],
      });
    } finally {
      setLoading(false);
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Sidebar */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <Button onClick={startNewChat} className="w-full flex items-center gap-2">
            <Plus size={16} /> New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chats.map((chat) => (
            <div key={chat.id} className="relative group">
              <button
                className={`w-full text-left p-2 rounded ${chat.id === activeChatId ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
                onClick={() => setActiveChatId(chat.id)}
              >
                {chat.title}
              </button>
              {chats.length > 1 && (
                <button
                  onClick={() => {
                    setChatToDelete(chat);
                    setDeleteModalOpen(true);
                  }}
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100"
                >
                  <X size={14} className="text-red-500" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-gray-200 p-4 flex justify-between items-center">
          <h1 className="font-semibold">{activeChat.title}</h1>
          <Input
            type="number"
            min={1}
            max={99}
            value={sceneCount}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSceneCount(Number(e.target.value))}
            placeholder="Scenes"
            className="w-24 text-sm"
          />
        </div>

        {/* Messages & Scenes */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeChat.messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`p-3 rounded-xl max-w-[70%] ${
                  msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {activeChat.scenes.map((scene) => (
            <div key={scene.sceneNumber} className="space-y-2">
              <h2 className="font-semibold">Scene {scene.sceneNumber}</h2>
              <p className="bg-gray-100 p-3 rounded">{scene.scenePrompt}</p>
              {scene.imageUrl ? (
                <img src={scene.imageUrl} alt={`Scene ${scene.sceneNumber}`} className="rounded w-full" />
              ) : (
                <div className="h-64 bg-gray-200 animate-pulse rounded" />
              )}
            </div>
          ))}

          {loading && (
            <div className="space-y-2">
              {[...Array(sceneCount)].map((_, i) => (
                <div key={i} className="h-64 bg-gray-200 animate-pulse rounded" />
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-200 flex gap-2">
          <Input
            value={input}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
            placeholder="Type your message..."
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => e.key === 'Enter' && sendMessage()}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || loading}>
            Send
          </Button>
        </div>
      </div>

      {/* Delete Modal */}
      <Dialog open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <Dialog.Panel className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full">
          <Dialog.Title className="font-semibold text-lg mb-4">Delete Chat?</Dialog.Title>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-red-600 hover:bg-red-700 text-white" onClick={deleteChat}>
              Delete
            </Button>
          </div>
        </Dialog.Panel>
      </Dialog>
    </div>
  );
}
