'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Paperclip, X } from "lucide-react";

export default function ChatInput({
  loading,
  onSend,
}: {
  loading: boolean;
  onSend: (text: string, files: { path: string; signedUrl: string }[]) => void;
}) {
  const [input, setInput] = useState("");
  const [uploads, setUploads] = useState<{ path: string; signedUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  // Get current logged-in user
  useEffect(() => {
    const fetchUser = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user) {
        setUserId(data.session.user.id);
      }
    };
    fetchUser();
  }, []);

  async function handleFile(file: File) {
    if (!userId) return alert("User not authenticated");

    setUploading(true);
    const filePath = `${userId}/${Date.now()}-${file.name}`;

    // Upload file to Supabase storage
    const { error } = await supabase.storage
      .from("user_uploads")
      .upload(filePath, file);

    if (error) {
      alert("Upload failed: " + error.message);
      setUploading(false);
      return;
    }

    // Generate public URL
    const { data } = supabase.storage.from("user_uploads").getPublicUrl(filePath);

    setUploads(prev => [...prev, { path: filePath, signedUrl: data.publicUrl }]);
    setUploading(false);
  }

  function handleSend() {
    if (!input.trim() && uploads.length === 0) return;
    onSend(input, uploads);
    setInput("");
    setUploads([]);
  }

  function handleRemove(path: string) {
    setUploads(prev => prev.filter(f => f.path !== path));
  }

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      {/* File previews */}
      {uploads.length > 0 && (
        <div className="flex gap-3 mb-3 flex-wrap">
          {uploads.map(file => (
            <div key={file.path} className="relative w-24 h-24 border rounded-lg overflow-hidden">
              {file.path.match(/\.(mp4|mov|avi)$/i) ? (
                <video src={file.signedUrl} className="w-full h-full object-cover" />
              ) : (
                <img src={file.signedUrl} className="w-full h-full object-cover" />
              )}
              <button
                onClick={() => handleRemove(file.path)}
                className="absolute top-1 right-1 bg-white rounded-full p-1 shadow"
              >
                <X size={14} className="text-red-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
        <label
  className={`cursor-pointer ${!userId ? "opacity-50 pointer-events-none" : ""}`}
>
  <input
    type="file"
    className="hidden"
    accept="image/*,video/*"
    onChange={(e) => {
      if (!userId) return;
      if (e.target.files && e.target.files.length > 0) {
        handleFile(e.target.files[0]);
        e.target.value = ""; // reset input so same file can be re-selected
      }
    }}
    disabled={!userId || uploading}
  />
  <Paperclip
    size={20}
    className={`text-gray-500 hover:text-gray-700 ${
      !userId ? "cursor-not-allowed" : ""
    }`}
  />
</label>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          rows={1}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="flex-1 resize-none border rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />

        <Button
          onClick={handleSend}
          disabled={loading || (!input.trim() && uploads.length === 0)}
          className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl"
        >
          Send
        </Button>
      </div>

      {uploading && <p className="text-sm text-gray-400 mt-2">Uploading...</p>}
    </div>
  );
}
