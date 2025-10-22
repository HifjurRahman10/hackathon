'use client';

import { useEffect, useState } from 'react';
import { db } from '@/lib/db/drizzle';
import { finalVideo, chats } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

interface FinalVideo {
  id: string;
  chatId: string;
  videoUrl: string;
  chat?: {
    title: string;
  };
}

export function FinalVideos() {
  const [videos, setVideos] = useState<FinalVideo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFinalVideos();
  }, []);

  const fetchFinalVideos = async () => {
    try {
      // For client-side, we'll need an API endpoint
      const response = await fetch('/api/final-videos');
      if (response.ok) {
        const data = await response.json();
        setVideos(data);
      }
    } catch (error) {
      console.error('Failed to fetch final videos:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="mt-8">
        <h3 className="text-xl font-semibold mb-4">Final Videos</h3>
        <div className="text-gray-500 text-center py-8">Loading...</div>
      </div>
    );
  }

  return (
    <div className="mt-8">
      <h3 className="text-xl font-semibold mb-4">Final Videos</h3>
      {videos.length === 0 ? (
        <div className="text-gray-500 text-center py-8">No videos yet</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((video) => (
            <div key={video.id} className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
              <div className="text-sm text-gray-600 mb-2">
                {video.chat?.title || 'Unknown Chat'}
              </div>
              <video
                src={video.videoUrl}
                controls
                className="w-full h-32 object-cover rounded"
                preload="metadata"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
