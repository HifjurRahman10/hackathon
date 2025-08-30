'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input'; // FIXED: Correct import for Input
import { Plus, MessageCircle, X } from 'lucide-react';
import { Dialog } from '@headlessui/react';
import { createBrowserClient } from '@supabase/ssr'; // FIXED: Use @supabase/ssr instead of deprecated auth-helpers

// Define types inline since database.types doesn't exist
type Message = { role: 'user' | 'assistant'; content: string };
type Scene = { id?: number; sceneNumber: number; scenePrompt: string; sceneImagePrompt: string; imageUrl?: string };
type Chat = { id: number; title: string; messages: Message[]; scenes: Scene[] };

export default function VideoDashboard() {
  // FIXED: Use createBrowserClient from @supabase/ssr
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const bottomRef = useRef<HTMLDivElement>(null);

  const [chats, setChats] = useState<Chat[]>([{ id: 0, title: 'New Chat', messages: [], scenes: [] }]);
  const [activeChatId, setActiveChatId] = useState<number>(0);
  const [input, setInput] = useState('');
  const [sceneCount, setSceneCount] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [chatToDelete, setChatToDelete] = useState<Chat | null>(null);

  const activeChat = chats.find(c => c.id === activeChatId);
  if (!activeChat) return <div>Loading...</div>;

  // Scroll to bottom on new messages/scenes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat.messages, activeChat.scenes]);

  // Persist chats in Supabase
  const saveChat = async (chat: Chat) => {
    setChats(prev => prev.map(c => (c.id === chat.id ? chat : c)));
    // You can implement upsert in Supabase here for chat metadata
    await supabase.from('chats').upsert({
      id: chat.id,
      title: chat.title,
      messages: chat.messages,
    });
  };

  const deleteChat = async () => {
    if (!chatToDelete) return;
    setChats(prev => prev.filter(c => c.id !== chatToDelete.id));
    if (chatToDelete.id === activeChatId) {
      setActiveChatId(chats[0]?.id ?? 0);
    }
    setDeleteModalOpen(false);
    setChatToDelete(null);
    await supabase.from('chats').delete().eq('id', chatToDelete.id);
  };

  const startNewChat = () => {
    const newId = Math.max(...chats.map(c => c.id), -1) + 1;
    const newChat: Chat = { id: newId, title: 'New Chat', messages: [], scenes: [] };
    setChats([newChat, ...chats]);
    setActiveChatId(newId);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    // Validate scene count
    if (sceneCount < 1 || sceneCount > 99) {
      alert('Scene count must be between 1 and 99.');
      return;
    }

    const newMessage: Message = { role: 'user', content: input };
    const updatedMessages = [...activeChat.messages, newMessage];
    saveChat({ ...activeChat, messages: updatedMessages });
    setInput('');
    setLoading(true);

    try {
      // Chat API call
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, sceneCount }),
      });

      if (!res.ok) {
        const { error } = await res.json();
        saveChat({
          ...activeChat,
          messages: [
            ...updatedMessages,
            { role: 'assistant', content: `⚠️ Error: ${error}` },
          ],
        });
        return;
      }

      const data = await res.json();
      const scenes: Scene[] = data.scenes || [];

      // Generate images in parallel and upload to Supabase
      const scenesWithImages = await Promise.all(
        scenes.map(async (scene) => {
          try {
            const imgRes = await fetch('/api/genImage', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ prompt: scene.sceneImagePrompt }),
            });
            const imgData = await imgRes.json();
            let imageUrl = imgData.imageUrl || ''; // FIXED: Use imageUrl instead of imageBase64

            if (imageUrl) {
              const filename = `scene-${Date.now()}-${scene.sceneNumber}.png`;
              const response = await fetch(imageUrl);
              const blob = await response.blob();

              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('user_uploads')
                .upload(filename, blob, { contentType: 'image/png' });

              if (!uploadError && uploadData) {
                // FIXED: Correct destructuring for getPublicUrl
                const { data } = supabase.storage.from('user_uploads').getPublicUrl(filename);
                imageUrl = data.publicUrl || '';
              }
            }

            return { ...scene, imageUrl };
          } catch (err) {
            console.error('Image gen/upload error:', err);
            return { ...scene, imageUrl: '' };
          }
        })
      );

      saveChat({
        ...activeChat,
        messages: updatedMessages,
        scenes: scenesWithImages,
      });

      // Optionally cache scenes in memory (useRef or React state) to limit Supabase calls
    } catch (err) {
      console.error('Send message error:', err);
      saveChat({
        ...activeChat,
        messages: [...updatedMessages, { role: 'assistant', content: '⚠️ Network error' }],
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Sidebar */}
      <div className="w-80 bg-gray-50 border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <Button onClick={startNewChat} className="w-full flex items-center gap-2">
            <Plus size={18} /> New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {chats.map(chat => (
            <div key={chat.id} className="relative group rounded-lg hover:bg-gray-100">
              <button
                className="w-full text-left p-3 flex items-center gap-2"
                onClick={() => setActiveChatId(chat.id)}
              >
                <MessageCircle size={16} className="text-gray-400" />
                <span className="truncate">{chat.title}</span>
              </button>
              {chats.length > 1 && (
                <button
                  onClick={() => { setChatToDelete(chat); setDeleteModalOpen(true); }}
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded"
                >
                  <X size={14} className="text-red-500" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {activeChat.messages.map((msg, i) => (
            <div key={i} className={`${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
              {msg.content.startsWith('![') ? (
                <img src={msg.content.match(/\((.*?)\)/)?.[1]} alt="Scene" className="rounded w-full max-w-md" />
              ) : (
                <p className={`${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-800'} inline-block p-2 rounded`}>
                  {msg.content}
                </p>
              )}
            </div>
          ))}

          {activeChat.scenes.map((scene) => (
            <div key={scene.sceneNumber} className="space-y-2">
              <h2 className="font-semibold">Scene {scene.sceneNumber}</h2>
              <p className="bg-gray-100 p-3 rounded">{scene.scenePrompt}</p>
              {scene.imageUrl ? (
                <img src={scene.imageUrl} className="rounded w-full" />
              ) : (
                <div className="h-64 bg-gray-200 animate-pulse rounded" />
              )}
            </div>
          ))}

          {loading && (
            <div className="space-y-2">
              {[...Array(sceneCount * 2)].map((_, i) => (
                <div key={i} className="h-6 bg-gray-200 rounded animate-pulse"></div>
              ))}
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 p-4 flex gap-2">
          <Input
            value={input}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
            placeholder="Type your message..."
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
          />
          <Button onClick={sendMessage} disabled={!input.trim() || loading}>
            Send
          </Button>
        </div>
      </div>

      {/* Delete modal */}
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
