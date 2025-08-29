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
  imageUrl?: string;
};

type Chat = {
  id: number;
  title: string;
  messages: Message[];
  scenes?: Scene[];
};

type CachedData = {
  chats: Chat[];
  activeChatId: number;
};

export default function VideoDashboard() {
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState(0);
  const [input, setInput] = useState('');
  const [sceneCount, setSceneCount] = useState(3);
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Hydrate state from localStorage
  useEffect(() => {
    const cached = localStorage.getItem('chatData');
    if (cached) {
      try {
        const parsed: CachedData = JSON.parse(cached);
        setChats(parsed.chats);
        setActiveChatId(parsed.activeChatId);
      } catch (err) {
        console.error('Failed to parse cached chat data:', err);
      }
    } else {
      // initialize default chat
      const newChat: Chat = { id: 0, title: 'New Chat', messages: [] };
      setChats([newChat]);
      setActiveChatId(0);
    }
  }, []);

  // Update localStorage on changes
  useEffect(() => {
    localStorage.setItem('chatData', JSON.stringify({ chats, activeChatId }));
  }, [chats, activeChatId]);

  const activeChat = chats.find(c => c.id === activeChatId)!;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat.messages]);

  const asMessage = (msg: any): Message => ({
    role: msg.role === 'assistant' ? 'assistant' : 'user',
    content: String(msg.content || ''),
  });

  function updateChat(id: number, updates: Partial<Chat>) {
    setChats(prev => prev.map(c => (c.id === id ? { ...c, ...updates } : c)));
  }

  function startNewChat() {
    const newId = Math.max(...chats.map(c => c.id), -1) + 1;
    const newChat = { id: newId, title: 'New Chat', messages: [] };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newId);
  }

  function deleteChat(chatId: number) {
    const updatedChats = chats.filter(c => c.id !== chatId);
    let newActiveId = activeChatId;
    if (chatId === activeChatId) {
      newActiveId = updatedChats[0]?.id ?? -1;
    }
    setChats(updatedChats);
    setActiveChatId(newActiveId);
  }

  async function sendMessage() {
    if (!input.trim()) return;

    const newMessage: Message = { role: 'user', content: input };
    const updatedMessages: Message[] = [...activeChat.messages, newMessage];
    updateChat(activeChatId, { messages: updatedMessages });
    setInput('');
    setLoading(true);

    try {
      // Chat API for multi-scene story
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
      const scenes: Scene[] = data.scenes;

      // Generate all scene images in parallel
      const imagePromises = scenes.map(scene =>
        fetch('/api/genImage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: scene.sceneImagePrompt }),
        }).then(res => res.json())
          .then(imgData => ({ ...scene, imageUrl: imgData.imageUrl }))
          .catch(err => {
            console.error('Image generation error:', err);
            return scene;
          })
      );

      const scenesWithImages = await Promise.all(imagePromises);

      // Flatten scenes into messages
      const sceneMessages: Message[] = scenesWithImages.flatMap(scene => {
        const msgs: Message[] = [
          { role: 'assistant', content: scene.scenePrompt },
        ];
        if (scene.imageUrl) {
          msgs.push({ role: 'assistant', content: `![Scene Image](${scene.imageUrl})` });
        }
        return msgs;
      });

      // Update chat
      updateChat(activeChatId, {
        messages: [...updatedMessages, ...sceneMessages],
        scenes: scenesWithImages,
        title: newMessage.content.slice(0, 30) + (newMessage.content.length > 30 ? '...' : ''),
      });
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
  }

  return (
    <div className="flex h-full overflow-hidden bg-white">
      {/* Sidebar */}
      <div className={`${sidebarOpen ? 'w-80' : 'w-0'} transition-all duration-300 bg-gray-50 border-r border-gray-200 flex flex-col overflow-hidden`}>
        <div className="p-4 border-b border-gray-200 space-y-2">
          <Button 
            onClick={startNewChat} 
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg flex items-center gap-2"
          >
            <Plus size={18} />
            New Chat
          </Button>
          <div className="flex items-center gap-2">
            <span>Scenes:</span>
            <Input
              type="number"
              min={1}
              max={20}
              value={sceneCount}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSceneCount(Number(e.target.value))}
              className="w-16"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-3">
          <div className="space-y-2">
            {chats.map(chat => (
              <div key={chat.id} className={`group relative rounded-lg transition-all duration-200 ${chat.id === activeChatId ? 'bg-blue-100 border border-blue-200' : 'hover:bg-gray-100'}`}>
                <button
                  className="w-full text-left p-3 rounded-lg flex items-start gap-3"
                  onClick={() => setActiveChatId(chat.id)}
                >
                  <MessageCircle size={16} className="mt-0.5 text-gray-400" />
                  <span className="flex-1 text-sm text-gray-700 line-clamp-2 leading-relaxed">{chat.title}</span>
                </button>
                
                {chats.length > 1 && (
                  <button
                    onClick={(e: React.MouseEvent) => { e.stopPropagation(); deleteChat(chat.id); }}
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
        <div className="border-b border-gray-200 p-4 bg-white shrink-0">
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
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            {activeChat.messages.length === 0 && !loading && (
              <div className="text-center py-12">
                <MessageCircle size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">Start a conversation...</p>
              </div>
            )}

            {activeChat.messages.map((message, idx) => (
              <div key={idx} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[70%] p-4 rounded-2xl ${message.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-gray-100 text-gray-800 rounded-bl-md'}`}>
                  {message.role === 'assistant' && message.content.startsWith('![') ? (
                    <>
                      {message.content.split('![')[0].trim() && (
                        <p className="whitespace-pre-wrap mb-2">{message.content.split('![')[0].trim()}</p>
                      )}
                      <img src={message.content.match(/\((.*?)\)/)?.[1]} alt="Scene" className="rounded-lg w-full mt-1" />
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="space-y-4">
                {Array.from({ length: sceneCount }).map((_, idx) => (
                  <div key={idx} className="flex gap-4 animate-pulse">
                    <div className="h-20 w-20 bg-gray-200 rounded-lg" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-4 bg-gray-200 rounded w-3/4" />
                      <div className="h-4 bg-gray-200 rounded w-1/2" />
                    </div>
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
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInput(e.target.value)}
                placeholder="Type your message..."
                onKeyDown={(e: React.KeyboardEvent) =>
                  e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())
                }
                disabled={loading}
                className="min-h-[44px] py-3 text-base border-gray-300 focus:border-blue-500 focus:ring-blue-500 rounded-xl resize-none"
              />
            </div>
            <Button onClick={sendMessage} disabled={loading || !input.trim()} className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-xl font-medium">
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
