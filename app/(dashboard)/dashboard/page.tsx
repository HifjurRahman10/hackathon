'use client';

import { useState, useRef, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js'; // FIXED: Use browser client for client components
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X } from 'lucide-react';

const supabase = createClient( // FIXED: Create browser client directly
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Message = { role: 'user' | 'assistant'; content: string; sceneNumber?: number };
type Scene = { id: number; sceneNumber: number; scenePrompt: string; sceneImagePrompt: string; imageUrl?: string };
type Chat = { id: number; title: string; scenes: Scene[]; messages: Message[] };

export default function VideoDashboard() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [numScenes, setNumScenes] = useState(3);
  const [loading, setLoading] = useState(false);
  const [selectedScene, setSelectedScene] = useState(1);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Fetch chats from Supabase on mount
  useEffect(() => {
    fetchChats();
  }, []);

  async function fetchChats() {
    const { data: chatsData } = await supabase.from('chats').select('*').order('created_at', { ascending: false });
    if (!chatsData) return;
    const chatsWithScenes: Chat[] = await Promise.all(
      chatsData.map(async (chat) => {
        const { data: scenes } = await supabase.from('scenes').select('*').eq('chat_id', chat.id).order('scene_number');
        return { ...chat, scenes: scenes || [], messages: [] };
      })
    );
    setChats(chatsWithScenes);
    setActiveChatId(chatsWithScenes[0]?.id || null);
    setSelectedScene(1);
  }

  const activeChat = chats.find(c => c.id === activeChatId) || null;
  const sceneMessages = activeChat?.scenes.filter(s => s.sceneNumber === selectedScene).map(s => ({
    role: 'assistant' as const,
    content: s.imageUrl ? `![Scene Image](${s.imageUrl})` : s.scenePrompt,
    sceneNumber: s.sceneNumber
  })) || [];

  function updateChat(id: number, updates: Partial<Chat>) {
    setChats(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));
  }

  async function newChat() {
    const { data: newChat, error } = await supabase.from('chats').insert([{ title: 'New Chat' }]).select().single();
    if (error || !newChat) return;
    setChats(prev => [...prev, { ...newChat, scenes: [], messages: [] }]);
    setActiveChatId(newChat.id);
    setSelectedScene(1);
  }

  async function deleteChat(id: number) {
    await supabase.from('chats').delete().eq('id', id);
    setChats(prev => prev.filter(c => c.id !== id));
    setActiveChatId(prev => (chats[0]?.id || null));
    setSelectedScene(1);
  }

  async function sendMessage() {
    if (!input.trim() || !activeChat) return;
    setLoading(true);
    const userMessage: Message = { role: 'user', content: input };
    updateChat(activeChat.id, { messages: [...activeChat.messages, userMessage] });
    setInput('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...activeChat.messages, userMessage], numScenes }),
      });
      if (!res.ok) throw new Error('Chat API error');
      const data = await res.json();
      const scenes: Scene[] = data.scenes;

      // Generate images in parallel and upload to Supabase storage
      await Promise.all(
        scenes.map(async (scene) => {
          const imgRes = await fetch('/api/genImage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: scene.sceneImagePrompt }),
          });
          const imgData = await imgRes.json();
          if (imgData.imageUrl) {
            // Upload to Supabase storage
            const fileName = `scene-${activeChat.id}-${scene.sceneNumber}.png`;
            const blob = await (await fetch(imgData.imageUrl)).blob();
            const { data: storageData, error: uploadError } = await supabase.storage
              .from('user_uploads')
              .upload(fileName, blob, { upsert: true });
            if (!uploadError) {
              scene.imageUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/user_uploads/${fileName}`;
            }
          }

          // Insert scene into DB
          await supabase.from('scenes').insert({
            chat_id: activeChat.id,
            scene_number: scene.sceneNumber,
            scene_prompt: scene.scenePrompt,
            scene_image_prompt: scene.sceneImagePrompt,
            image_url: scene.imageUrl || null
          });
        })
      );

      fetchChats(); // refresh chat + scenes from DB
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  // FIXED: Combine user messages and scene messages for display
  const allMessages = [
    ...(activeChat?.messages || []),
    ...sceneMessages
  ];

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
            <div key={chat.id} className={`flex items-center justify-between mb-2 p-2 rounded cursor-pointer ${chat.id === activeChatId ? 'bg-blue-100' : 'hover:bg-gray-100'}`}>
              <button className="flex-1 text-left" onClick={() => setActiveChatId(chat.id)}>{chat.title}</button>
              <button onClick={() => deleteChat(chat.id)} className="text-gray-400 hover:text-red-500"><X className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
      </div>

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Scene Selector */}
        <div className="p-2 border-b border-gray-200 flex items-center gap-2">
          <label className="text-sm">Scene:</label>
          <select
            value={selectedScene}
            onChange={(e) => setSelectedScene(Number(e.target.value))}
            className="border px-2 py-1 rounded"
          >
            {Array.from({ length: numScenes }, (_, i) => i + 1).map(num => (
              <option key={num} value={num}>Scene {num}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {allMessages.map((message, idx) => (
            <div key={`${message.role}-${idx}`} className={`mb-4 ${message.role === 'user' ? 'text-right' : 'text-left'}`}>
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
          <Button onClick={sendMessage} disabled={!input.trim() || loading}>Send</Button>
        </div>
      </div>
    </div>
  );
}
