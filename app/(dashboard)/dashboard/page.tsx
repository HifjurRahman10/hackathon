'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; content: string };
type Scene = { sceneNumber: number; scenePrompt: string; sceneImagePrompt: string };
type Chat = { id: number; title: string; messages: Message[] };

export default function VideoDashboard() {
  const [chats, setChats] = useState<Chat[]>([{ id: 0, title: 'New Chat', messages: [] }]);
  const [activeChatId, setActiveChatId] = useState(0);
  const [input, setInput] = useState('');
  const [numScenes, setNumScenes] = useState(3);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find(c => c.id === activeChatId)!;

  // --- Persistence: Load chats from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('videoChats');
    if (saved) {
      const parsed = JSON.parse(saved);
      setChats(parsed);
      setActiveChatId(parsed[0]?.id ?? 0);
    }
  }, []);

  // --- Persistence: Save chats to localStorage
  useEffect(() => {
    localStorage.setItem('videoChats', JSON.stringify(chats));
  }, [chats]);

  // --- Auto scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat.messages]);

  function updateChat(id: number, updates: Partial<Chat>) {
    setChats(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));
  }

  function newChat() {
    const newId = chats.length ? Math.max(...chats.map(c => c.id)) + 1 : 0;
    setChats([...chats, { id: newId, title: 'New Chat', messages: [] }]);
    setActiveChatId(newId);
  }

  function deleteChat(id: number) {
    const remaining = chats.filter(c => c.id !== id);
    setChats(remaining.length ? remaining : [{ id: 0, title: 'New Chat', messages: [] }]);
    setActiveChatId(remaining.length ? remaining[0].id : 0);
  }

  async function sendMessage() {
    if (!input.trim()) return;
    if (numScenes < 1 || numScenes > 99 || isNaN(numScenes)) {
      updateChat(activeChatId, {
        messages: [
          ...activeChat.messages,
          { role: 'assistant', content: '⚠️ Error: Scene count must be between 1 and 99' },
        ],
      });
      return;
    }

    const newMessage: Message = { role: 'user', content: input };
    const updatedMessages = [...activeChat.messages, newMessage];
    updateChat(activeChatId, { messages: updatedMessages });
    setInput('');
    setLoading(true);

    try {
      // Call chat API
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, numScenes }),
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
        updateChat(activeChatId, {
          messages: [...updatedMessages, { role: 'assistant', content: `⚠️ Error: ${error}` }],
        });
        return;
      }

      const data = await res.json();
      const scenes: Scene[] = data.scenes;

      // Parallel image requests
      const sceneImages = await Promise.all(
        scenes.map(async (scene) => {
          try {
            const imgRes = await fetch('/api/genImage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: scene.sceneImagePrompt }),
            });
            if (!imgRes.ok) return null;
            const imgData = await imgRes.json();
            return imgData.imageUrl || null;
          } catch {
            return null;
          }
        })
      );

      // Build final messages
      const finalMessages: Message[] = [];
      scenes.forEach((scene, idx) => {
        finalMessages.push({ role: 'assistant', content: scene.scenePrompt });
        if (sceneImages[idx]) {
          finalMessages.push({ role: 'assistant', content: `![Scene Image](${sceneImages[idx]})` });
        }
      });

      updateChat(activeChatId, {
        messages: [...updatedMessages, ...finalMessages],
        title: activeChat.title === 'New Chat' ? input.slice(0, 30) : activeChat.title,
      });
    } catch (err) {
      console.error('Send message error:', err);
      updateChat(activeChatId, {
        messages: [...activeChat.messages, { role: 'assistant', content: '⚠️ Network error' }],
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Sidebar */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <Button onClick={newChat}>
            <Plus className="w-4 h-4 mr-1" /> New Chat
          </Button>
        </div>
        <div className="px-4 py-2">
          <label className="text-sm mr-2">Scenes:</label>
          <input
            type="number"
            min={1}
            max={99}
            value={numScenes}
            onChange={(e) => setNumScenes(Number(e.target.value))}
            className="border px-2 py-1 rounded w-20"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`flex items-center justify-between mb-2 p-2 rounded cursor-pointer ${
                chat.id === activeChatId ? 'bg-blue-100' : 'hover:bg-gray-100'
              }`}
            >
              <button className="flex-1 text-left" onClick={() => setActiveChatId(chat.id)}>
                {chat.title}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(chat.id);
                }}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto p-4">
          {activeChat.messages.map((message, idx) => (
            <div key={idx} className={`mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
              {message.content.startsWith('![') ? (
                <img
                  src={message.content.match(/\((.*?)\)/)?.[1]}
                  alt="Scene"
                  className="rounded w-full max-w-md"
                />
              ) : (
                <p
                  className={`inline-block p-2 rounded ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {message.content}
                </p>
              )}
            </div>
          ))}
          {loading && (
            <div className="space-y-2">
              {[...Array(numScenes * 2)].map((_, i) => (
                <div key={i} className="h-6 bg-gray-200 rounded animate-pulse"></div>
              ))}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-200 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || loading}>
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}
