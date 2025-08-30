'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, MessageCircle, X } from 'lucide-react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type Scene = {
  sceneNumber: number;
  scenePrompt: string;
  sceneImagePrompt: string;
};

type Chat = {
  id: number;
  title: string;
  messages: Message[];
};

export default function VideoDashboard() {
  const [mounted, setMounted] = useState(false);
  const [chats, setChats] = useState<Chat[]>([{ id: 0, title: 'New Chat', messages: [] }]);
  const [activeChatId, setActiveChatId] = useState(0);
  const [input, setInput] = useState('');
  const [numScenes, setNumScenes] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deleteModalChatId, setDeleteModalChatId] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const activeChat = chats.find(c => c.id === activeChatId) ?? chats[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat.messages]);

  function updateChat(id: number, updates: Partial<Chat>) {
    setChats(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));
  }

  function startNewChat() {
    const newId = Math.max(...chats.map(c => c.id), -1) + 1;
    const newChat = { id: newId, title: 'New Chat', messages: [] };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newId);
  }

  function confirmDeleteChat() {
    if (deleteModalChatId === null) return;
    setChats(prev => prev.filter(c => c.id !== deleteModalChatId));
    if (deleteModalChatId === activeChatId) {
      const remainingChats = chats.filter(c => c.id !== deleteModalChatId);
      setActiveChatId(remainingChats[0]?.id || 0);
    }
    setDeleteModalChatId(null);
  }

  async function sendMessage() {
    if (!input.trim()) return;

    const newMessage: Message = { role: 'user', content: input };
    const updatedMessages: Message[] = [...activeChat.messages, newMessage];
    updateChat(activeChatId, { messages: updatedMessages });
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, numScenes: numScenes || 1 }),
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

      const imagePromises = scenes.map(scene =>
        fetch('/api/genImage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: scene.sceneImagePrompt }),
        }).then(r => r.json())
      );

      const images = await Promise.all(imagePromises);

      const finalMessages: Message[] = scenes.flatMap((scene, idx) => [
        { role: 'assistant', content: scene.scenePrompt },
        images[idx]?.imageUrl
          ? { role: 'assistant', content: `![Scene Image](${images[idx].imageUrl})` }
          : { role: 'assistant', content: '' },
      ]);

      updateChat(activeChatId, {
        messages: [...updatedMessages, ...finalMessages],
        title:
          activeChat.title === 'New Chat' && newMessage.content.length > 0
            ? newMessage.content.slice(0, 30) + (newMessage.content.length > 30 ? '...' : '')
            : activeChat.title,
      });
    } catch (err) {
      console.error(err);
      updateChat(activeChatId, {
        messages: [
          ...updatedMessages,
          { role: 'assistant', content: '⚠️ Network error. Please try again.' },
        ],
      });
    } finally {
      setLoading(false);
    }
  }

  if (!mounted) return null; // prevent SSR errors

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-gray-50 border-r border-gray-200 flex flex-col overflow-hidden`}>
        <div className="p-4 border-b border-gray-200">
          <Button 
            onClick={startNewChat} 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg flex items-center gap-2"
          >
            <Plus size={18} />
            New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {chats.map(chat => (
              <div
                key={chat.id}
                className={`group relative rounded-lg transition-all duration-200 ${
                  chat.id === activeChatId 
                    ? 'bg-blue-100 border border-blue-200' 
                    : 'hover:bg-gray-100'
                }`}
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
                    onClick={(e: any) => { e.stopPropagation(); setDeleteModalChatId(chat.id); }}
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

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header with scene selector */}
        <div className="border-b border-gray-200 p-4 bg-white shrink-0 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2"
            >
              <MessageCircle size={20} />
            </Button>
            <h1 className="font-semibold text-gray-800 truncate">{activeChat.title}</h1>
          </div>
          <Input
            type="number"
            min={1}
            max={20}
            value={numScenes ?? ''}
            onChange={e => setNumScenes(Number(e.target.value))}
            placeholder="Number of scenes"
            className="w-28 border-gray-300 focus:border-blue-500 focus:ring-blue-500 rounded-xl"
          />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            {activeChat.messages.length === 0 && (
              <div className="text-center py-12">
                <MessageCircle size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">Start a conversation...</p>
              </div>
            )}

            {activeChat.messages.map((message, idx) => (
              <div
                key={idx}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] p-4 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  }`}
                >
                  {message.role === 'assistant' && message.content.startsWith('![') ? (
                    <>
                      {message.content.split('![')[0].trim() && (
                        <p className="whitespace-pre-wrap mb-2">{message.content.split('![')[0].trim()}</p>
                      )}
                      <img
                        src={message.content.match(/\((.*?)\)/)?.[1]}
                        alt="Scene"
                        className="rounded-lg w-full mt-1"
                      />
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start space-y-2 flex-col">
                {[...Array(numScenes || 1)].map((_, idx) => (
                  <div key={idx} className="w-full max-w-[70%] h-16 bg-gray-200 rounded-2xl animate-pulse" />
                ))}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 bg-white p-4 shrink-0">
          <div className="max-w-4xl mx-auto flex gap-3 items-end">
            <div className="flex-1">
              <Input
                value={input}
                onChange={(e: any) => setInput(e.target.value)}
                placeholder="Type your message..."
                onKeyDown={(e: any) =>
                  e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())
                }
                disabled={loading}
                className="min-h-[44px] py-3 text-base border-gray-300 focus:border-blue-500 focus:ring-blue-500 rounded-xl resize-none"
              />
            </div>
            <Button 
              onClick={sendMessage} 
              disabled={loading || !input.trim()}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl font-medium"
            >
              Send
            </Button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalChatId !== null && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="bg-white rounded-xl p-6 w-80">
            <h2 className="text-lg font-semibold mb-4">Delete Chat?</h2>
            <p className="text-sm text-gray-600 mb-6">Are you sure you want to delete this chat? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setDeleteModalChatId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={confirmDeleteChat}>Delete</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
