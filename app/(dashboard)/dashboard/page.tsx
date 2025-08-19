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
    if (chats.length === 1) return; // Don't delete the last chat
    
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
  ...

  {/* Main Chat Area */}
  <div className="flex-1 flex flex-col min-w-0">
    {/* Header */}
    <div className="border-b border-gray-200 p-4 bg-white shrink-0">
      ...
    </div>

    {/* Messages */}
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Messages go here */}
        <div ref={bottomRef} />
      </div>
    </div>

    {/* Input Area (pinned) */}
    <div className="border-t border-gray-200 bg-white p-4 shrink-0">
      <div className="max-w-4xl mx-auto flex gap-3 items-end">
        <div className="flex-1">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            onKeyDown={(e) =>
              e.key === "Enter" &&
              !e.shiftKey &&
              (e.preventDefault(), sendMessage())
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