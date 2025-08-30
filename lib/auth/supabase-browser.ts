import { createBrowserClient } from '@supabase/ssr'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl) {
  console.warn('Missing NEXT_PUBLIC_SUPABASE_URL')
}
if (!supabaseAnonKey) {
  console.warn('Missing NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export function getBrowserSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase env vars not set')
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}