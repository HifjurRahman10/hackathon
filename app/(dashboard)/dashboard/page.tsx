'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export default function VideoDashboard() {
  const [currentProject, setCurrentProject] = useState<{ id: number; name: string } | null>(null);
  const [projects, setProjects] = useState([
    { id: 1, name: 'My First Project' },
    { id: 2, name: 'Travel Video' },
  ]);
  const [prompt, setPrompt] = useState('');

  return (
    <div className="flex h-[calc(100vh-68px)] bg-white">
      
      {/* Left Sidebar */}
      <aside className="w-64 border-r border-gray-200 p-4 flex flex-col">
        <Button 
          className="mb-4 bg-orange-500 hover:bg-orange-600 text-white" 
          onClick={() => setCurrentProject(null)}
        >
          + New Project
        </Button>
        <div className="flex-1 overflow-y-auto space-y-2">
          {projects.map((p) => (
            <Button
              key={p.id}
              variant={currentProject?.id === p.id ? 'secondary' : 'ghost'}
              className="w-full justify-start"
              onClick={() => setCurrentProject(p)}
            >
              {p.name}
            </Button>
          ))}
        </div>
      </aside>

      {/* Center Area */}
      <main className="flex-1 p-4 overflow-auto">
        {currentProject ? (
          <div className="h-full flex flex-col">
            <h2 className="text-lg font-semibold mb-4">{currentProject.name}</h2>
            <div className="flex-1 border border-gray-300 rounded-lg p-4 bg-gray-50 flex items-center justify-center">
              {/* Video timeline placeholder */}
              <p className="text-gray-500">[ Video Editing Timeline Here ]</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full">
            <h2 className="text-xl font-semibold mb-4">Create a New Project</h2>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your video idea..."
              className="w-full max-w-lg mb-4"
              rows={4}
            />
            <Button 
              className="bg-orange-500 hover:bg-orange-600 text-white"
              onClick={() => {
                const newProject = { id: Date.now(), name: 'Untitled Project' };
                setProjects([...projects, newProject]);
                setCurrentProject(newProject);
              }}
            >
              Generate Project
            </Button>
          </div>
        )}
      </main>

      {/* Right Sidebar */}
      {currentProject && (
        <aside className="w-80 border-l border-gray-200 p-4 flex flex-col">
          <div className="flex-1 overflow-y-auto">
            <p className="text-gray-500 mb-4">AI Assistant</p>
            {/* AI chat messages placeholder */}
            <div className="mb-4 space-y-2">
              <div className="bg-gray-100 p-2 rounded">Try adding a forest scene.</div>
              <div className="bg-orange-100 p-2 rounded self-end">Good idea!</div>
            </div>
          </div>
          <div className="mt-auto">
            <Input
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ask AI..."
              className="mb-2"
            />
            <Button className="bg-orange-500 hover:bg-orange-600 text-white w-full">
              Send
            </Button>
          </div>
        </aside>
      )}
    </div>
  );
}
