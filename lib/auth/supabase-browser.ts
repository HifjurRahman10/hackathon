import { createClient } from '@supabase/supabase-js';

// Browser-side Supabase client
let browserClient: ReturnType<typeof createClient> | null = null;
export function getBrowserSupabase() {
  if (browserClient) return browserClient;
  
  browserClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true
      }
    }
  );
  
  return browserClient;
}