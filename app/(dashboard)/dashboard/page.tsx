'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';

export default function ContentAutomationUI() {
  const [prompt, setPrompt] = useState('');
  const [script, setScript] = useState('');
  const [imagePrompts, setImagePrompts] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    setIsGenerating(true);

    // Placeholder: Use real API call in production
    setTimeout(() => {
      setScript('Scene 1: A child wakes up in a small village and dreams of becoming an adventurer.\nScene 2: The child sees a poster about a grand quest and runs out excited.\nScene 3: The journey begins through a misty forest.');
      setImagePrompts([
        'A small rural village at dawn, soft lighting, peaceful',
        'A child looking at a quest poster with excitement in their eyes',
        'A misty forest trail with sunlight piercing through trees',
      ]);
      setIsGenerating(false);
    }, 1000);
  };

  return (
    <section className="flex-1 p-4 lg:p-8 max-w-4xl mx-auto space-y-8">
      <h1 className="text-2xl font-semibold">Content Automation Studio</h1>

      {/* Step 1: Prompt Input */}
      <Card>
        <CardHeader>
          <CardTitle>1. Enter Your Idea</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="E.g. An animated story about a kid discovering a magic forest"
            rows={4}
          />
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="animate-spin mr-2 h-4 w-4" /> Generating...
              </>
            ) : (
              'Generate Script & Frames'
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Step 2: Script Output */}
      {script && (
        <Card>
          <CardHeader>
            <CardTitle>2. Generated Script</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-sm whitespace-pre-wrap text-muted-foreground bg-gray-100 p-4 rounded-md">
              {script}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Frame Prompts */}
      {imagePrompts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3. Image Prompts for Scenes</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc list-inside space-y-2">
              {imagePrompts.map((imgPrompt, idx) => (
                <li key={idx} className="text-muted-foreground">
                  {imgPrompt}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </section>
  );
}
