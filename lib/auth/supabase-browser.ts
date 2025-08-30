import { createBrowserClient } from '@supabase/ssr'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Primary factory (was sb)
export function sb() {
  if (!url || !anon) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return createBrowserClient(url, anon)
}

// Add the expected named export to fix the build import error
export function getBrowserSupabase() {
  return sb()
}

// (Optional) default export if any code uses it
export default getBrowserSupabase 