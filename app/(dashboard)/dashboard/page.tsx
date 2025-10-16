"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { getBrowserSupabase } from "@/lib/auth/supabase-browser";

export default function DashboardPage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [sceneImages, setSceneImages] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUser() {
      const supabase = getBrowserSupabase();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
      } else {
        setError("Please sign in to use this feature");
      }
    }
    fetchUser();
  }, []);

  async function handleGenerate() {
    if (!userId) {
      setError("Please sign in to use this feature");
      return;
    }

    setError(null);
    setSceneImages([]);
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
        }),
      });

      if (!charRes.ok) {
        const errorData = await charRes.json().catch(() => ({ error: "Character generation failed" }));
        throw new Error(errorData.error || "Character generation failed");
      }
      const charData = await charRes.json();

      // 2️⃣ Generate Character Image
      const imgRes = await fetch("/api/genImage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: charData.image_prompt,
          type: "character",
          recordId: charData.id,
          userId,
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
        }),
      });

      if (!sceneRes.ok) {
        const errorData = await sceneRes.json().catch(() => ({ error: "Scene generation failed" }));
        throw new Error(errorData.error || "Scene generation failed");
      }
      const { scenes } = await sceneRes.json();
      if (!Array.isArray(scenes) || scenes.length !== 3)
        throw new Error("Scene data malformed");

      // 4️⃣ Generate Scene Images in Parallel
      const sceneImages = await Promise.all(
        scenes.map(async (scene) => {
          const img = await fetch("/api/genImage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: scene.scene_image_prompt,
              type: "scene",
              recordId: scene.id,
              userId,
            }),
          });

          if (!img.ok) {
            const errorData = await img.json().catch(() => ({ error: `Scene ${scene.scene_number} image failed` }));
            throw new Error(errorData.error || `Scene ${scene.scene_number} image failed`);
          }
          const { imageUrl } = await img.json();
          return imageUrl;
        })
      );

      // 5️⃣ Display Scene Images
      setSceneImages(sceneImages);
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-4 text-center">
          Cinematic Scene Generator
        </h1>

        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your story idea..."
          className="w-full p-4 border rounded-lg focus:outline-none focus:ring-2 focus:ring-black min-h-[100px]"
        />

        <div className="flex justify-center mt-4">
          <button
            onClick={handleGenerate}
            disabled={loading || !prompt.trim()}
            className="px-6 py-2 bg-black text-white rounded-lg disabled:opacity-50"
          >
            {loading ? "Generating..." : "Generate"}
          </button>
        </div>

        {error && (
          <p className="text-red-600 text-center mt-4 font-medium">{error}</p>
        )}

        {/* Scene Images */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mt-8">
          {sceneImages.map((src, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-xl overflow-hidden shadow-md"
            >
              <Image
                src={src}
                alt={`Scene ${i + 1}`}
                fill
                className="object-cover"
              />
              <span className="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
                Scene {i + 1}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
