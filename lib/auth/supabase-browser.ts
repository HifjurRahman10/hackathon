import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export function sb() {
  if (!url || !anon) throw new Error('Missing Supabase public env vars')
  return createBrowserClient(url, anon)
}