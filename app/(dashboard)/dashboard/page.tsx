'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, MessageCircle, X } from 'lucide-react';

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

type Chat = {
  id: number;
  title: string;
  messages: Message[];
};

export default function VideoDashboard() {
  const [chats, setChats] = useState<Chat[]>([
    { id: 0, title: 'New Chat', messages: [] },
  ]);
  const [activeChatId, setActiveChatId] = useState(0);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId)!;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat.messages]);

  function updateChat(id: number, updates: Partial<Chat>) {
    setChats((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  }

  function startNewChat() {
    const newId = Math.max(...chats.map(c => c.id), -1) + 1;
    const newChat = { id: newId, title: 'New Chat', messages: [] };
    setChats((prev) => [newChat, ...prev]);
    setActiveChatId(newId);
  }

  function deleteChat(chatId: number) {
    if (chats.length === 1) return;
    setChats(prev => prev.filter(c => c.id !== chatId));
    if (chatId === activeChatId) {
      const remainingChats = chats.filter(c => c.id !== chatId);
      setActiveChatId(remainingChats[0]?.id || 0);
    }
  }

  async function sendMessage() {
    if (!input.trim()) return;

    const newMessage: Message = { role: 'user', content: input };
    const updatedMessages = [...activeChat.messages, newMessage];

    updateChat(activeChatId, { messages: updatedMessages });
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: updatedMessages }),
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
      const reply =
        data.choices?.[0]?.message?.content ||
        '⚠️ No response from assistant.';

      updateChat(activeChatId, {
        messages: [...updatedMessages, { role: 'assistant', content: reply }],
        title:
          activeChat.title === 'New Chat' && newMessage.content.length > 0
            ? newMessage.content.slice(0, 30) + (newMessage.content.length > 30 ? '...' : '')
            : activeChat.title,
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
            {chats.map((chat) => (
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
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
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
            <h1 className="font-semibold text-gray-800 truncate">
              {activeChat.title}
            </h1>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            {activeChat.messages.length === 0 && (
              <div className="text-center py-12">
                <MessageCircle size={48} className="mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 text-lg">Start a conversation...</p>
                <p className="text-gray-400 text-sm mt-2">Ask me anything you'd like to know!</p>
              </div>
            )}
            
            {activeChat.messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] px-4 py-3 rounded-2xl ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-md'
                      : 'bg-gray-100 text-gray-800 rounded-bl-md'
                  }`}
                >
                  <p className="whitespace-pre-wrap leading-relaxed">
                    {message.content}
                  </p>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-100 px-4 py-3 rounded-2xl rounded-bl-md">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </div>
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
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your message..."
                onKeyDown={(e) =>
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
    </div>
  );
}