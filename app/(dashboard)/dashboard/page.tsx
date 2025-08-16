'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquare, Plus, ArrowUp, Trash2 } from 'lucide-react';

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
  const [hoveredChatId, setHoveredChatId] = useState<number | null>(null);
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
    const newId = chats.length;
    setChats((prev) => [...prev, { id: newId, title: 'New Chat', messages: [] }]);
    setActiveChatId(newId);
  }

  function deleteChat(chatId: number) {
    if (chats.length === 1) return;
    
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    
    if (chatId === activeChatId) {
      const remainingChats = chats.filter((c) => c.id !== chatId);
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
            { role: 'assistant', content: `❌ Error: ${error}` },
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
          activeChat.title === 'New Chat'
            ? newMessage.content.slice(0, 30) + (newMessage.content.length > 30 ? '...' : '')
            : activeChat.title,
      });
    } catch (err) {
      console.error('Fetch error:', err);
      updateChat(activeChatId, {
        messages: [
          ...updatedMessages,
          { role: 'assistant', content: '❌ Network error. Try again.' },
        ],
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-screen bg-white text-gray-900">
      {/* Sidebar */}
      <div className="w-64 transition-all duration-200 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="p-3 border-b border-gray-200">
          <Button 
            onClick={startNewChat} 
            className="w-full bg-gray-900 hover:bg-gray-800 text-white rounded-lg py-2.5"
          >
            <Plus className="h-4 w-4 mr-2" />
            New chat
          </Button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group relative mb-1 ${
                chat.id === activeChatId 
                  ? 'bg-gray-200 text-gray-900' 
                  : 'text-gray-700 hover:bg-gray-100'
              } rounded-lg transition-colors`}
              onMouseEnter={() => setHoveredChatId(chat.id)}
              onMouseLeave={() => setHoveredChatId(null)}
            >
              <button
                className="w-full text-left px-3 py-2.5 rounded-lg flex items-center gap-3 truncate"
                onClick={() => setActiveChatId(chat.id)}
              >
                <MessageSquare className="h-4 w-4 flex-shrink-0" />
                <span className="truncate text-sm">{chat.title}</span>
              </button>
              
              {hoveredChatId === chat.id && chats.length > 1 && (
                <div className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteChat(chat.id);
                    }}
                    className="h-6 w-6 p-0 hover:bg-gray-200"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* User Avatar at bottom */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
              U
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">User</p>
              <p className="text-xs text-gray-500">Online</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col h-screen">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto" style={{ height: 'calc(100vh - 80px)' }}>
          {activeChat.messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center p-8">
              <div className="mb-8">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 mx-auto">
                  <MessageSquare className="h-8 w-8 text-gray-600" />
                </div>
                <h2 className="text-2xl font-medium text-gray-900 mb-2">How can I help you today?</h2>
                <p className="text-gray-600">Start a conversation and I'll do my best to help</p>
              </div>
            </div>
          )}

          <div className="max-w-3xl mx-auto">
            {activeChat.messages.map((m, i) => (
              <div
                key={i}
                className={`group px-4 py-6 ${
                  m.role === 'assistant' ? 'bg-gray-50' : 'bg-white'
                } border-b border-gray-100 last:border-b-0`}
              >
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${
                      m.role === 'user' ? 'bg-blue-500' : 'bg-gray-700'
                    }`}>
                      {m.role === 'user' ? 'U' : 'AI'}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="prose prose-gray max-w-none">
                      <div className="whitespace-pre-wrap break-words text-gray-900 leading-7">
                        {m.content}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="px-4 py-6 bg-gray-50 border-b border-gray-100">
                <div className="flex gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gray-700 text-white text-sm font-medium">
                      AI
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-gray-600">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div ref={bottomRef} />
        </div>

        {/* Input area */}
        <div className="border-t border-gray-200 p-4 bg-white flex-shrink-0">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2">
              <div className="flex-1 relative">
                <Input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Message AI Assistant..."
                  onKeyDown={(e) =>
                    e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())
                  }
                  disabled={loading}
                  className="pr-12 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[44px]"
                  style={{ paddingTop: '12px', paddingBottom: '12px' }}
                />
                <Button
                  onClick={sendMessage}
                  disabled={loading || !input.trim()}
                  className="absolute right-2 top-1/2 transform -translate-y-1/2 h-8 w-8 p-0 rounded-lg bg-gray-900 hover:bg-gray-700 disabled:bg-gray-300"
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              AI can make mistakes. Consider checking important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}