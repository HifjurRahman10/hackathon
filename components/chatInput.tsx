"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Paperclip, X } from "lucide-react";

export default function ChatInput({
  userId,
  loading,
  onSend,
}: {
  userId: string;
  loading: boolean;
  onSend: (text: string, files: { path: string; signedUrl: string }[]) => void;
}) {
  const [input, setInput] = useState("");
  const [uploads, setUploads] = useState<{ name: string; path: string; signedUrl: string }[]>([]);
  const [uploading, setUploading] = useState(false);

  async function handleFile(file: File) {
    setUploading(true);

    const filePath = `${userId}/${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from("users_uploads")
      .upload(filePath, file);

    if (uploadError) {
      alert("Upload failed: " + uploadError.message);
      setUploading(false);
      return;
    }

    // Save metadata in DB
    await fetch("/api/files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: filePath,
        name: file.name,
        type: file.type,
        size: file.size,
      }),
    });

    // Generate signed URL
    const { data: signedData, error: signedError } = await supabase.storage
      .from("users_uploads")
      .createSignedUrl(filePath, 3600);

    if (signedError || !signedData) {
      alert("Failed to get signed URL: " + signedError?.message);
      setUploading(false);
      return;
    }

    setUploads((prev) => [...prev, { name: file.name, path: filePath, signedUrl: signedData.signedUrl }]);
    setUploading(false);
  }

  function handleSend() {
    if (!input.trim() && uploads.length === 0) return;

    // send files with signed URLs
    onSend(
      input,
      uploads.map((f) => ({ path: f.path, signedUrl: f.signedUrl }))
    );

    setInput("");
    setUploads([]);
  }

  function handleRemove(path: string) {
    setUploads((prev) => prev.filter((f) => f.path !== path));
  }

  return (
    <div className="border-t border-gray-200 bg-white p-4">
      {/* File previews */}
      {uploads.length > 0 && (
        <div className="flex gap-3 mb-3 flex-wrap">
          {uploads.map((file) => (
            <div key={file.path} className="relative w-24 h-24 border rounded-lg overflow-hidden">
              {file.name.match(/\.(mp4|mov|avi)$/i) ? (
                <video src={file.signedUrl} className="w-full h-full object-cover" controls />
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
        <label className="cursor-pointer">
          <input
            type="file"
            className="hidden"
            accept="image/*,video/*"
            onChange={(e) => e.target.files && handleFile(e.target.files[0])}
          />
          <Paperclip size={20} className="text-gray-500 hover:text-gray-700" />
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
