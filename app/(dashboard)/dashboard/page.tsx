"use client";
import { useEffect, useState, useRef } from "react";
import { sb } from "@/lib/auth/supabase-browser";

const supabase = sb();

export default function DashboardPage() {
  const [chats, setChats] = useState<any[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null); // FIX: Changed to string for UUID
  const [loading, setLoading] = useState(false);
  const [numScenes, setNumScenes] = useState(3);
  const [inputs, setInputs] = useState<Record<string, string>>({}); // FIX: Changed to string keys
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const fetchChats = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // FIX: Get local user ID first
      const { data: localUser } = await supabase
        .from('users')
        .select('id')
        .eq('supabase_id', user.id)
        .single();

      if (!localUser) return;

      const { data, error } = await supabase
        .from("chats")
        .select("*, scenes(*)")
        .eq("user_id", localUser.id) // FIX: Use local user ID
        .order("created_at", { ascending: false });

      if (!error && data) {
        const withMessages = data.map((c: any) => ({
          ...c,
          messages: c.messages || [],
        }));

        setChats(withMessages);
        if (withMessages.length) setActiveChatId(withMessages[0].id);

        const savedInputs: Record<string, string> = {}; // FIX: Changed to string keys
        withMessages.forEach((c: any) => savedInputs[c.id] = "");
        setInputs(savedInputs);
      }
    };

    fetchChats();
  }, []);

  const activeChat = chats.find((c) => c.id === activeChatId);

  const handleInputChange = (value: string) => {
    if (!activeChatId) return;
    setInputs((prev) => ({ ...prev, [activeChatId]: value }));
  };

  const sendMessage = async () => {
    if (!activeChatId) return;
    const messageInput = inputs[activeChatId]?.trim();
    if (!messageInput) return;

    setLoading(true);
    try {
      const chat = chats.find((c) => c.id === activeChatId);
      if (!chat) return;

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId: chat.id,
          messages: [...chat.messages, { role: "user", content: messageInput }],
          numScenes,
          userId: (await supabase.auth.getUser()).data.user?.id,
        }),
      });

      if (!res.ok) throw new Error("Failed to send message");

      const data = await res.json();
      const updatedScenes = [...chat.scenes, ...data.scenes];

      setChats((prev) =>
        prev.map((c) =>
          c.id === chat.id
            ? { ...c, scenes: updatedScenes, messages: [...c.messages, { role: "user", content: messageInput }] }
            : c
        )
      );

      setInputs((prev) => ({ ...prev, [chat.id]: "" }));

      // Generate images in parallel
      await Promise.all(updatedScenes.map((scene: any) => generateImage(scene)));

      scrollToBottom();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const generateImage = async (scene: any, forceRegenerate = false) => {
    if (!activeChatId) return;

    if (scene.imageUrl && !forceRegenerate) {
      try {
        const res = await fetch(scene.imageUrl, { method: "HEAD" });
        if (res.ok) return;
      } catch {
        console.warn("Supabase URL expired, regenerating...");
      }
    }

    try {
      const res = await fetch("/api/genImage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: scene.sceneImagePrompt,
          chatId: activeChatId,
          sceneNumber: scene.sceneNumber,
          force: forceRegenerate,
        }),
      });

      if (!res.ok) throw new Error("Image generation failed");

      const { imageUrl } = await res.json();

      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId
            ? {
                ...c,
                scenes: c.scenes.map((s: any) =>
                  s.sceneNumber === scene.sceneNumber ? { ...s, imageUrl } : s
                ),
              }
            : c
        )
      );
    } catch (err) {
      console.error(err);
    }
  };

  const createNewChat = async () => {
    try {
      // Get current authenticated user
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        console.error('No authenticated user');
        return;
      }

      // Find local user by supabase_id
      let { data: localUser, error: userError } = await supabase // FIX: Changed to let
        .from('users')
        .select('id')
        .eq('supabase_id', authUser.id)
        .single();

      if (userError || !localUser) {
        console.error('Local user not found:', userError);
        // Try to create the user if they don't exist
        const { data: newUser, error: createError } = await supabase
          .from('users')
          .insert({
            supabase_id: authUser.id,
            email: authUser.email || '',
            name: authUser.user_metadata?.full_name || authUser.email?.split('@')[0] || '',
            role: 'member'
          })
          .select('id')
          .single();

        if (createError) {
          console.error('Failed to create user:', createError);
          return;
        }
        
        // Use the newly created user
        localUser = newUser; // FIX: Now works because localUser is let
      }

      // Create chat with the local user ID
      const { data, error } = await supabase
        .from("chats")
        .insert({
          title: "New Chat",
          user_id: localUser.id
        })
        .select()
        .single();

      if (error) {
        console.error("Insert chat error:", error.message);
        return;
      }

      if (data) { // FIX: Completed the if statement
        setChats(prev => [{ ...data, scenes: [], messages: [] }, ...prev]);
        setActiveChatId(data.id);
        setInputs(prev => ({ ...prev, [data.id]: "" }));
      }
    } catch (err) {
      console.error('Error creating chat:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <button
            onClick={createNewChat}
            className="w-full bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            New Chat
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {chats.map((chat) => (
            <div
              key={chat.id}
              onClick={() => setActiveChatId(chat.id)}
              className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 ${
                activeChatId === chat.id ? 'bg-blue-50 border-blue-200' : ''
              }`}
            >
              <h3 className="font-medium text-gray-900 truncate">{chat.title}</h3>
              <p className="text-sm text-gray-500 mt-1">
                {new Date(chat.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {activeChat ? (
          <>
            {/* Chat Header */}
            <div className="bg-white border-b border-gray-200 p-4">
              <h1 className="text-xl font-semibold text-gray-900">{activeChat.title}</h1>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeChat.messages?.map((message: any, index: number) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-900'
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              ))}

              {/* Scenes */}
              {activeChat.scenes?.map((scene: any, index: number) => (
                <div key={index} className="bg-white rounded-lg border border-gray-200 p-6">
                  <h3 className="text-lg font-semibold mb-3">Scene {scene.sceneNumber}</h3>
                  <p className="text-gray-700 mb-4">{scene.scenePrompt}</p>
                  
                  {scene.imageUrl && (
                    <div className="mb-4">
                      <img
                        src={scene.imageUrl}
                        alt={`Scene ${scene.sceneNumber}`}
                        className="w-full max-w-md mx-auto rounded-lg"
                      />
                      <button
                        onClick={() => generateImage(scene, true)}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                      >
                        Regenerate Image
                      </button>
                    </div>
                  )}
                  
                  {scene.characterDescription && (
                    <div className="text-sm text-gray-600">
                      <strong>Character:</strong> {scene.characterDescription}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className="text-center text-gray-500">
                  Generating response...
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="bg-white border-t border-gray-200 p-4">
              <div className="flex items-center space-x-4 mb-4">
                <label className="text-sm font-medium text-gray-700">
                  Number of scenes:
                </label>
                <select
                  value={numScenes}
                  onChange={(e) => setNumScenes(Number(e.target.value))}
                  className="border border-gray-300 rounded px-3 py-1 text-sm"
                >
                  {[1, 2, 3, 4, 5].map(num => (
                    <option key={num} value={num}>{num}</option>
                  ))}
                </select>
              </div>
              
              <div className="flex space-x-4">
                <textarea
                  value={activeChatId ? inputs[activeChatId] || '' : ''} // FIX: Check null
                  onChange={(e) => handleInputChange(e.target.value)}
                  placeholder="Describe your story..."
                  className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  rows={3}
                  disabled={loading}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !activeChatId || !inputs[activeChatId]?.trim()} // FIX: Check null
                  className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Send
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Select a chat or create a new one to get started
          </div>
        )}
      </div>
    </div>
  );
}
