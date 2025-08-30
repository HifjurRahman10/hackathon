'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, MessageCircle, X } from 'lucide-react';
import { Dialog } from '@headlessui/react';

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

export default function VideoDashboard() {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Load chats from localStorage
  const [chats, setChats] = useState<Chat[]>(() => {
    try {
      const stored = localStorage.getItem('chats');
      return stored ? JSON.parse(stored) : [{ id: 0, title: 'New Chat', messages: [], scenes: [] }];
    } catch {
      return [{ id: 0, title: 'New Chat', messages: [], scenes: [] }];
    }
  });

  const [activeChatId, setActiveChatId] = useState<number>(chats[0].id);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sceneCount, setSceneCount] = useState<number>(1);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);

  const activeChat = chats.find(c => c.id === activeChatId)!;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat.messages, activeChat.scenes]);

  // Persist chats to localStorage
  const saveChats = (newChats: Chat[]) => {
    setChats(newChats);
    localStorage.setItem('chats', JSON.stringify(newChats));
  };

  const updateChat = (id: number, updates: Partial<Chat>) => {
    const newChats = chats.map(c => (c.id === id ? { ...c, ...updates } : c));
    saveChats(newChats);
  };

  const startNewChat = () => {
    const newId = Math.max(...chats.map(c => c.id), -1) + 1;
    const newChat: Chat = { id: newId, title: 'New Chat', messages: [], scenes: [] };
    saveChats([newChat, ...chats]);
    setActiveChatId(newId);
  };

  const deleteChat = () => {
    if (!chatToDelete) return;
    const newChats = chats.filter(c => c.id !== chatToDelete.id);
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
      alert('Scene count must be between 1 and 99.');
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
          messages: [
            ...updatedMessages,
            { role: 'assistant', content: `⚠️ Error: ${error}` },
          ],
        });
        return;
      }

      const data = await res.json();
      const scenes: Scene[] = data.scenes || [];

      // Generate all images in parallel
      const scenePromises = scenes.map(async (scene: Scene) => {
        try {
          const imgRes = await fetch('/api/genImage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: scene.sceneImagePrompt }),
          });
          const imgData = await imgRes.json();
          return { ...scene, imageUrl: imgData.imageUrl || '' };
        } catch (err) {
          console.error('Image generation error:', err);
          return { ...scene, imageUrl: '' };
        }
      });

      const scenesWithImages = await Promise.all(scenePromises);
      updateChat(activeChatId, { scenes: scenesWithImages });
    } catch (err) {
      console.error('Fetch error:', err);
      updateChat(activeChatId, {
        messages: [
          ...updatedMessages,
          { role: 'assistant', content: '⚠️ Network error. Please try again.' },
        ],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Sidebar */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <Button
            onClick={startNewChat}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg flex items-center gap-2"
          >
            <Plus size={18} /> New Chat
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {chats.map(chat => (
              <div
                key={chat.id}
                className="group relative rounded-lg transition-all duration-200 hover:bg-gray-100"
              >
                <button
                  className="w-full text-left p-3 rounded-lg flex items-start gap-3"
                  onClick={() => setActiveChatId(chat.id)}
                >
                  <MessageCircle size={16} className="mt-0.5 text-gray-400" />
                  <span className="flex-1 text-sm text-gray-700 line-clamp-2 leading-relaxed">
                    {chat.title}
                  </span>
                </button>
                {chats.length > 1 && (
                  <button
                    onClick={() => {
                      setChatToDelete(chat);
                      setDeleteModalOpen(true);
                    }}
                    className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-100 rounded"
                  >
                    <X size={14} className="text-red-500" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="border-b border-gray-200 p-4 bg-white flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold text-gray-800 truncate">{activeChat.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              max={99}
              value={sceneCount}
              onChange={(e) => setSceneCount(Number(e.target.value))}
              placeholder="Scenes"
              className="w-24 text-sm"
            />
          </div>
        </div>

        {/* Chat / Scenes */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeChat.messages.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <MessageCircle size={48} className="mx-auto mb-4" />
              <p>Start a conversation...</p>
            </div>
          )}

          {activeChat.messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[70%] p-4 rounded-2xl ${
                  msg.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-800 rounded-bl-md'
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </div>
            </div>
          ))}

          {/* Render scenes */}
          {activeChat.scenes.map((scene: Scene, idx: number) => (
            <div key={idx} className="space-y-2">
              <h2 className="font-semibold">Scene {scene.sceneNumber}</h2>
              <p className="bg-gray-100 p-3 rounded-md">{scene.scenePrompt}</p>
              {scene.imageUrl ? (
                <img src={scene.imageUrl} className="rounded-lg w-full" />
              ) : (
                <div className="h-64 bg-gray-200 animate-pulse rounded-lg" />
              )}
            </div>
          ))}

          {loading && (
            <div className="h-64 bg-gray-200 animate-pulse rounded-lg" />
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 bg-white p-4 flex gap-3">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
            className="flex-1 min-h-[44px] py-3 text-base border-gray-300 focus:border-blue-500 focus:ring-blue-500 rounded-xl"
          />
          <Button onClick={sendMessage} disabled={loading || !input.trim()} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-medium">
            Send
          </Button>
        </div>
      </div>

      {/* Delete Modal */}
      <Dialog open={deleteModalOpen} onClose={() => setDeleteModalOpen(false)} className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
        <Dialog.Panel className="bg-white p-6 rounded-lg shadow-lg max-w-sm w-full">
          <Dialog.Title className="font-semibold text-lg mb-4">Delete Chat?</Dialog.Title>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteModalOpen(false)}>Cancel</Button>
            <Button onClick={deleteChat} className="bg-red-600 hover:bg-red-700 text-white">Delete</Button>
          </div>
        </Dialog.Panel>
      </Dialog>
    </div>
  );
}
