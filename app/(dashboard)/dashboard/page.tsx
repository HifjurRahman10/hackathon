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
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<number>(0);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [sceneCount, setSceneCount] = useState<number>(1);
  const [deleteModalChatId, setDeleteModalChatId] = useState<number | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find(c => c.id === activeChatId);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat?.messages]);

  // Load from localStorage on mount
  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem('chats');
    if (stored) {
      const parsed: Chat[] = JSON.parse(stored);
      setChats(parsed);
      setActiveChatId(parsed[0]?.id ?? 0);
    } else {
      // Initialize first chat
      const initialChat: Chat = { id: 0, title: 'New Chat', messages: [], scenes: [] };
      setChats([initialChat]);
      setActiveChatId(0);
    }
  }, []);

  // Save chats to localStorage whenever chats change
  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('chats', JSON.stringify(chats));
  }, [chats, mounted]);

  function updateChat(id: number, updates: Partial<Chat>) {
    setChats(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));
  }

  function startNewChat() {
    const newId = Math.max(...chats.map(c => c.id), -1) + 1;
    const newChat: Chat = { id: newId, title: 'New Chat', messages: [], scenes: [] };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newId);
  }

  function confirmDeleteChat() {
    if (deleteModalChatId === null) return;
    const updatedChats = chats.filter(c => c.id !== deleteModalChatId);
    setChats(updatedChats);
    if (deleteModalChatId === activeChatId) {
      setActiveChatId(updatedChats[0]?.id || 0);
    }
    setDeleteModalChatId(null);
  }

  async function sendMessage() {
    if (!input.trim() || !activeChat) return;

    const newMessage: Message = { role: 'user', content: input };
    const updatedMessages: Message[] = [...activeChat.messages, newMessage];

    updateChat(activeChatId, { messages: updatedMessages });
    setInput('');
    setLoading(true);

    try {
      // Call your chat API for multiple scenes
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages, sceneCount }),
      });
      const data = await res.json();

      if (!res.ok) {
        updateChat(activeChatId, {
          messages: [
            ...updatedMessages,
            { role: 'assistant', content: `⚠️ Error: ${data.error || 'Unknown error'}` },
          ],
        });
        return;
      }

      const scenes: Scene[] = data.scenes;

      // Parallel image generation
      const imagePromises = scenes.map(scene =>
        fetch('/api/genImage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: scene.sceneImagePrompt }),
        }).then(res => res.json())
      );

      const images = await Promise.all(imagePromises);

      // Combine scenes with imageUrl
      const finalScenes = scenes.map((scene, idx) => ({
        ...scene,
        imageUrl: images[idx]?.imageUrl || '',
      }));

      // Update chat
      const sceneMessages: Message[] = finalScenes.map(scene => ({
        role: 'assistant',
        content: `Scene ${scene.sceneNumber}: ${scene.scenePrompt}\n![Scene Image](${scene.imageUrl})`,
      }));

      updateChat(activeChatId, {
        messages: [...updatedMessages, ...sceneMessages],
        scenes: finalScenes,
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
                  chat.id === activeChatId ? 'bg-blue-100 border border-blue-200' : 'hover:bg-gray-100'
                }`}
              >
                <button
                  className="w-full text-left p-3 rounded-lg flex items-start gap-3"
                  onClick={() => setActiveChatId(chat.id)}
                >
                  <MessageCircle size={16} className="mt-0.5 text-gray-400" />
                  <span className="flex-1 text-sm text-gray-700 line-clamp-2 leading-relaxed">{chat.title}</span>
                </button>

                {chats.length > 1 && (
                  <button
                    onClick={e => { e.stopPropagation(); setDeleteModalChatId(chat.id); }}
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
        {/* Header */}
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
            <h1 className="font-semibold text-gray-800 truncate">{activeChat?.title}</h1>
          </div>

          {/* Scene selector */}
          <Input
            type="number"
            min={1}
            value={sceneCount}
            onChange={e => setSceneCount(Number(e.target.value))}
            placeholder="Scenes"
            className="w-24 text-sm"
          />
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            {activeChat?.messages.length === 0 && (
              <div className="text-center py-12">
                <MessageCircle size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">Start a conversation...</p>
                <p className="text-gray-400 text-sm mt-2">Ask me anything you'd like to know!</p>
              </div>
            )}

            {activeChat?.messages.map((message, index) => (
              <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[70%] p-4 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  }`}
                >
                  {message.role === 'assistant' && message.content.startsWith('Scene') ? (
                    <>
                      <p className="whitespace-pre-wrap mb-2">{message.content.split('![Scene Image]')[0].trim()}</p>
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
              <div className="flex flex-col gap-3">
                {Array.from({ length: sceneCount }).map((_, idx) => (
                  <div key={idx} className="flex justify-start animate-pulse">
                    <div className="bg-gray-200 h-24 w-full rounded-xl"></div>
                  </div>
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
                onChange={e => setInput(e.target.value)}
                placeholder="Type your message..."
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())}
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
      <Dialog open={deleteModalChatId !== null} onClose={() => setDeleteModalChatId(null)} className="fixed z-50 inset-0 flex items-center justify-center">
        <div className="fixed inset-0 bg-black opacity-30" />
        <div className="bg-white rounded-lg p-6 z-50 max-w-sm w-full">
          <Dialog.Title className="font-semibold text-lg">Delete Chat?</Dialog.Title>
          <p className="mt-2 text-sm text-gray-600">Are you sure you want to delete this chat? This action cannot be undone.</p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteModalChatId(null)}>Cancel</Button>
            <Button className="bg-red-500 hover:bg-red-600 text-white" onClick={confirmDeleteChat}>Delete</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
