"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";
import { Plus, MessageSquare, Trash2, Video } from "lucide-react";


interface Chat {
  id: string;
  title: string;
  created_at: string;
}

interface SceneData {
  imageUrl: string;
  videoUrl?: string;
}

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [scenes, setScenes] = useState<SceneData[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [hasExistingScenes, setHasExistingScenes] = useState(false);
  const [generatingVideos, setGeneratingVideos] = useState(false);
  const [stitchedVideoUrl, setStitchedVideoUrl] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUser() {
      const supabase = getBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        try {
          await fetch("/api/user/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ supabaseUser: user }),
          });
        } catch (err) {
          console.error("Failed to sync user:", err);
        }
        
        setUserId(user.id);
        await loadChats(user.id);
      } else {
        setError("Please sign in to use this feature");
      }
    }
    fetchUser();
  }, []);

  async function loadChats(uid: string) {
    try {
      const res = await fetch(`/api/chats?userId=${uid}`);
      const { chats } = await res.json();
      setChats(chats || []);
      if (chats && chats.length > 0) {
        setCurrentChatId(chats[0].id);
        await loadScenes(chats[0].id);
      } else {
        const newChatRes = await fetch("/api/chats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: uid, title: "New Chat" }),
        });
        const { chat } = await newChatRes.json();
        setChats([chat]);
        setCurrentChatId(chat.id);
      }
    } catch (err) {
      console.error("Failed to load chats:", err);
    }
  }

  async function loadScenes(chatId: string) {
    try {
      const res = await fetch(`/api/scenes?chatId=${chatId}`);
      const { scenes } = await res.json();
      if (scenes && scenes.length > 0) {
        const sceneData = scenes.map((s: any) => ({
          imageUrl: s.image_url,
          videoUrl: s.video_url || undefined
        }));
        setScenes(sceneData);
        setHasExistingScenes(true);
      } else {
        setScenes([]);
        setHasExistingScenes(false);
      }
    } catch (err) {
      console.error("Failed to load scenes:", err);
      setScenes([]);
      setHasExistingScenes(false);
    }
  }

  async function createNewChat() {
    if (!userId) return;
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, title: "New Chat" }),
      });
      const { chat } = await res.json();
      setChats([chat, ...chats]);
      setCurrentChatId(chat.id);
      setScenes([]);
      setHasExistingScenes(false);
      setPrompt("");
    } catch (err) {
      console.error("Failed to create chat:", err);
    }
  }

  async function deleteChat(chatId: string) {
    try {
      await fetch(`/api/chats?chatId=${chatId}`, { method: "DELETE" });
      const newChats = chats.filter((c) => c.id !== chatId);
      setChats(newChats);
      if (currentChatId === chatId) {
        setCurrentChatId(newChats[0]?.id || null);
        if (newChats[0]) {
          await loadScenes(newChats[0].id);
        } else {
          setScenes([]);
          setHasExistingScenes(false);
        }
      }
    } catch (err) {
      console.error("Failed to delete chat:", err);
    }
  }

  async function handleGenerate() {
    if (!userId || !currentChatId) {
      setError("Please create a chat first");
      return;
    }

    if (hasExistingScenes) {
      setError("Only one prompt allowed per chat. Create a new chat to generate more.");
      return;
    }

    setError(null);
    setScenes([]);
    setLoading(true);

    try {
      // 1️⃣ Generate Character
      const charRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          mode: "character",
          userId,
          chatId: currentChatId,
        }),
      });

      if (!charRes.ok) {
        const errorData = await charRes.json().catch(() => ({ error: "Character generation failed" }));
        throw new Error(errorData.error || "Character generation failed");
      }
      const charResponse = await charRes.json();
      const charData = charResponse.data;

      if (!charData?.image_prompt) {
        throw new Error("Invalid character data received");
      }

      // 2️⃣ Generate Character Image
      const imgRes = await fetch("/api/genImage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: charData.image_prompt,
          type: "character",
          recordId: charData.id,
          userId,
          metadata: { chatId: currentChatId },
        }),
      });

      if (!imgRes.ok) {
        const errorData = await imgRes.json().catch(() => ({ error: "Character image generation failed" }));
        throw new Error(errorData.error || "Character image generation failed");
      }
      const { imageUrl: characterImageUrl } = await imgRes.json();

      console.log("Character created:", charData.name, "→", characterImageUrl);

      // 3️⃣ Generate 3 Scenes
      const sceneRes = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: `${prompt}\nCharacter: ${charData.name}\nDescription: ${charData.image_prompt}`,
          mode: "scenes",
          userId,
          chatId: currentChatId,
        }),
      });

      if (!sceneRes.ok) {
        const errorData = await sceneRes.json().catch(() => ({ error: "Scene generation failed" }));
        throw new Error(errorData.error || "Scene generation failed");
      }
      const sceneResponse = await sceneRes.json();
      const scenesData = sceneResponse.data;
      if (!Array.isArray(scenesData) || scenesData.length !== 3)
        throw new Error("Scene data malformed");

      // 4️⃣ Generate Scene Images in Parallel
      const sceneImages = await Promise.all(
        scenesData.map(async (scene, index) => {
          const img = await fetch("/api/genImage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: scene.scene_image_prompt,
              type: "scene",
              recordId: scene.id,
              userId,
              metadata: { chatId: currentChatId },
            }),
          });

          if (!img.ok) {
            const errorData = await img.json().catch(() => ({ error: `Scene ${index + 1} image failed` }));
            throw new Error(errorData.error || `Scene ${index + 1} image failed`);
          }
          const { imageUrl } = await img.json();
          return { imageUrl, sceneId: scene.id, videoPrompt: scene.scene_video_prompt };
        })
      );

      // 5️⃣ Display Scene Images
      setScenes(sceneImages.map(s => ({ imageUrl: s.imageUrl })));
      setHasExistingScenes(true);
      setLoading(false);

      // 6️⃣ Generate Videos in Parallel
      setGeneratingVideos(true);
      const videoResults = await Promise.all(
        sceneImages.map(async (scene, index) => {
          try {
            console.log(`Starting video generation for scene ${index + 1}...`);
            const videoRes = await fetch("/api/genVideo", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: scene.videoPrompt,
                imageUrl: scene.imageUrl,
                sceneId: scene.sceneId,
                userId,
                metadata: { chatId: currentChatId },
              }),
            });

            if (!videoRes.ok) {
              const errorData = await videoRes.json().catch(() => ({}));
              console.error(`Video ${index + 1} generation failed:`, errorData);
              return null;
            }
            const { videoUrl } = await videoRes.json();
            console.log(`Video ${index + 1} completed:`, videoUrl);
            return { index, videoUrl };
          } catch (err) {
            console.error(`Error generating video ${index + 1}:`, err);
            return null;
          }
        })
      );

      // 7️⃣ Update scenes with video URLs
      const updatedScenes = scenes.map((scene, idx) => {
        const result = videoResults.find(r => r?.index === idx);
        return result ? { ...scene, videoUrl: result.videoUrl } : scene;
      });
      setScenes(updatedScenes);
      setGeneratingVideos(false);

      // Stitch videos if all are ready
      if (updatedScenes.every((s: SceneData) => s.videoUrl)) {
        const videoUrls = updatedScenes.map(s => s.videoUrl!);
        const stitchRes = await fetch("/api/stitch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrls, chatId: currentChatId, userId }),
        });
        if (stitchRes.ok) {
          const { videoUrl } = await stitchRes.json();
          setStitchedVideoUrl(videoUrl);
        } else {
          console.error("Stitching failed");
        }
      }



    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong");
      setLoading(false);
      setGeneratingVideos(false);
    }
  }

  // async function stitchVideos() {
    if (scenes.some(s => !s.videoUrl)) return;
    setStitching(true);
    try {
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: '/ffmpeg-core.js',
        wasmURL: '/ffmpeg-core.wasm',
      });
      // Write input files
      for (let i = 0; i < scenes.length; i++) {
        const response = await fetch(scenes[i].videoUrl!);
        const blob = await response.blob();
        await ffmpeg.writeFile(`input${i}.mp4`, await fetchFile(blob));
      }
      // Create concat file
      const concatList = scenes.map((_, i) => `file 'input${i}.mp4'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatList);
      // Run concat
      await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', 'output.mp4']);
      // Read output
      const data = await ffmpeg.readFile('output.mp4');
      const url = URL.createObjectURL(new Blob([data as any], { type: 'video/mp4' }));
      setStitchedVideoUrl(url);
    } catch (err) {
      console.error('Stitching failed:', err);
    } finally {
      setStitching(false);
    }
  // }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="w-64 bg-gray-900 text-white flex flex-col">
        <div className="p-4">
          <button
            onClick={createNewChat}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition"
          >
            <Plus className="w-5 h-5" />
            New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={`group flex items-center justify-between p-3 rounded-lg cursor-pointer hover:bg-gray-800 transition ${
                currentChatId === chat.id ? "bg-gray-800" : ""
              }`}
              onClick={() => {
                setCurrentChatId(chat.id);
                loadScenes(chat.id);
              }}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <MessageSquare className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm truncate">{chat.title}</span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(chat.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto">
            <h1 className="text-2xl font-semibold mb-4 text-center">
              Cinematic Scene Generator
            </h1>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleGenerate();
                }
              }}
              placeholder="Enter your story idea..."
              className="w-full p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black min-h-[100px]"
              disabled={loading}
            />

            <div className="flex justify-center mt-4">
              <button
                onClick={handleGenerate}
                disabled={loading || !prompt.trim() || !currentChatId}
                className="px-6 py-2 bg-black text-white rounded-lg disabled:opacity-50 hover:bg-gray-800 transition"
              >
                {loading ? "Generating..." : "Generate"}
              </button>
            </div>



            {error && (
              <p className="text-red-600 text-center mt-4 font-medium">{error}</p>
            )}

            {generatingVideos && (
              <p className="text-blue-600 text-center mt-4 font-medium flex items-center justify-center gap-2">
                <Video className="w-5 h-5 animate-pulse" />
                Generating videos in background...
              </p>
            )}



            {/* Scene Images & Videos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-8">
              {scenes.map((scene, i) => (
                <div
                  key={i}
                  className="relative aspect-square rounded-xl overflow-hidden shadow-md bg-gray-100"
                >
                  {scene.videoUrl ? (
                    <video
                      src={scene.videoUrl}
                      controls
                      autoPlay
                      loop
                      muted
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Image
                      src={scene.imageUrl}
                      alt={`Scene ${i + 1}`}
                      fill
                      className="object-cover"
                    />
                  )}
                  <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded flex items-center gap-1">
                    {scene.videoUrl ? (
                      <>
                        <Video className="w-3 h-3" />
                        Scene {i + 1}
                      </>
                    ) : (
                      `Scene ${i + 1}`
                    )}
                  </span>
                  {!scene.videoUrl && generatingVideos && (
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                      <div className="text-center text-white">
                        <Video className="w-8 h-8 mx-auto animate-pulse mb-2" />
                        <p className="text-xs">Processing...</p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {stitchedVideoUrl && (
              <div className="mt-8">
                <h2 className="text-xl font-semibold mb-4 text-center">Stitched Cinematic Video</h2>
                <div className="flex justify-center">
                  <video
                    src={stitchedVideoUrl}
                    controls
                    className="max-w-full rounded-lg shadow-md"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}