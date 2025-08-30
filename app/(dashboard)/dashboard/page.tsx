'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';
import { getBrowserSupabase } from '@/lib/auth/supabase';

type Message = { role: 'user' | 'assistant'; content: string };
type Scene = { sceneNumber: number; scenePrompt: string; sceneImagePrompt: string; imageUrl?: string };
type Chat = { id: number; title: string; messages: Message[] };

export default function VideoDashboard() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [numScenes, setNumScenes] = useState(3);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const supabase = getBrowserSupabase();
  const activeChat = chats.find(c => c.id === activeChatId);

  // Auto scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  // Load chats from Supabase
  useEffect(() => {
    async function loadChats() {
      const { data, error } = await supabase
        .from('video_chats')
        .select('id, title, chat_scenes(*)');

      if (error) {
        console.error('Error loading chats:', error);
        return;
      }

      const loadedChats: Chat[] = (data || []).map((c: any) => ({
        id: c.id,
        title: c.title,
        messages: (c.chat_scenes || []).flatMap((s: any) => [
          { role: 'assistant', content: s.scene_text },
          { role: 'assistant', content: `![Scene Image](${s.image_url})` }
        ])
      }));

      setChats(loadedChats);
      if (loadedChats.length) setActiveChatId(loadedChats[0].id);
    }
    loadChats();
  }, []);

  function updateChat(id: number, updates: Partial<Chat>) {
    setChats(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));
  }

  async function sendMessage() {
    if (!input.trim() || !activeChat) return;

    if (numScenes < 1 || numScenes > 99) {
      updateChat(activeChatId!, {
        messages: [...activeChat.messages, { role: 'assistant', content: '⚠️ Error: Scene count must be between 1 and 99' }],
      });
      return;
    }

    const newMessage: Message = { role: 'user', content: input };
    const updatedMessages = [...activeChat.messages, newMessage];
    updateChat(activeChatId!, { messages: updatedMessages });
    setInput('');
    setLoading(true);

    try {
      // Call chat API
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, numScenes, chatTitle: activeChat.title }),
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Unknown error' }));
        updateChat(activeChatId!, {
          messages: [...updatedMessages, { role: 'assistant', content: `⚠️ Error: ${error}` }],
        });
        return;
      }

      const { scenes } = await res.json();
      const finalMessages: Message[] = [];

      scenes.forEach((scene: Scene) => {
        finalMessages.push({ role: 'assistant', content: scene.scenePrompt });
        if (scene.imageUrl) {
          finalMessages.push({ role: 'assistant', content: `![Scene Image](${scene.imageUrl})` });
        }
      });

      updateChat(activeChatId!, {
        messages: [...updatedMessages, ...finalMessages],
        title: activeChat.title === 'New Chat' ? input.slice(0, 30) : activeChat.title,
      });

    } catch (err) {
      console.error('Send message error:', err);
      updateChat(activeChatId!, {
        messages: [...activeChat.messages, { role: 'assistant', content: '⚠️ Network error' }],
      });
    } finally {
      setLoading(false);
    }
  }

  async function newChat() {
    const title = 'New Chat';
    const { data, error } = await supabase
      .from('video_chats')
      .insert({ title })
      .select()
      .single();

    if (error) {
      console.error('Error creating chat:', error);
      return;
    }

    const chat: Chat = { id: data.id, title: data.title, messages: [] };
    setChats(prev => [...prev, chat]);
    setActiveChatId(data.id);
  }

  async function deleteChat(id: number) {
    const { error } = await supabase.from('video_chats').delete().eq('id', id);
    if (error) console.error('Delete chat error:', error);

    setChats(prev => prev.filter(c => c.id !== id));
    if (activeChatId === id) setActiveChatId(chats[0]?.id ?? null);
  }

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Sidebar */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <Button onClick={newChat}><Plus className="w-4 h-4 mr-1" /> New Chat</Button>
        </div>

        <div className="px-4 py-2">
          <label className="text-sm mr-2">Scenes:</label>
          <input
            type="number"
            min={1}
            max={99}
            value={numScenes}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNumScenes(Number(e.target.value))}
            className="border px-2 py-1 rounded w-20"
          />
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {chats.map(chat => (
            <div
              key={chat.id}
              className={`flex items-center justify-between mb-2 p-2 rounded cursor-pointer ${chat.id === activeChatId ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
            >
              <button className="flex-1 text-left" onClick={() => setActiveChatId(chat.id)}>
                {chat.title}
              </button>
              <button
                onClick={e => { e.stopPropagation(); deleteChat(chat.id); }}
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
          {activeChat?.messages.map((message, idx) => (
            <div key={idx} className={`mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
              {message.content.startsWith('![') ? (
                <img src={message.content.match(/\((.*?)\)/)?.[1]} alt="Scene" className="rounded w-full max-w-md" />
              ) : (
                <p className={`inline-block p-2 rounded ${message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'}`}>
                  {message.content}
                </p>
              )}
            </div>
          ))}
          {loading && <div className="space-y-2">{[...Array(numScenes * 2)].map((_, i) => <div key={i} className="h-6 bg-gray-200 rounded animate-pulse"></div>)}</div>}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-200 flex gap-2">
          <Input
            value={input}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
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
