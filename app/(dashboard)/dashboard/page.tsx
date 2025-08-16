'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeChat = chats.find((c) => c.id === activeChatId)!;

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeChat.messages]);

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
            ? newMessage.content.slice(0, 20) + '...'
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

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <div className="w-64 border-r p-2 flex flex-col">
        <Button onClick={startNewChat} className="mb-2">
          + New Chat
        </Button>
        <div className="flex-1 overflow-y-auto space-y-1">
          {chats.map((chat) => (
            <Button
              key={chat.id}
              variant={chat.id === activeChatId ? 'default' : 'outline'}
              className="w-full justify-start"
              onClick={() => setActiveChatId(chat.id)}
            >
              {chat.title}
            </Button>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex flex-col flex-1 p-4">
        {/* Chat container */}
        <div className="flex-1 overflow-y-auto space-y-4 p-4 border rounded-lg bg-white">
          {activeChat.messages.length === 0 && (
            <p className="text-muted-foreground text-center">
              Start chatting with the assistant...
            </p>
          )}
          {activeChat.messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${
                m.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`px-4 py-2 rounded-2xl max-w-[75%] whitespace-pre-line ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-2 rounded-2xl bg-gray-100 text-gray-500">
                <span className="animate-pulse">Assistant is typing…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 mt-4">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Message the assistant..."
            onKeyDown={(e) =>
              e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), sendMessage())
            }
            disabled={loading}
          />
          <Button onClick={sendMessage} disabled={loading}>
            {loading ? '...' : 'Send'}
          </Button>
        </div>
      </div>
    </div>
  );
}
