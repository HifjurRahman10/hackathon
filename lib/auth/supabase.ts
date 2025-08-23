import { createBrowserClient, createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export function createBrowserSupabase() {
  return createBrowserClient(supabaseUrl, supabaseAnon);
}

export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      get(name) {
        return cookieStore.get(name)?.value;
      },
      set(name, value, options) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name, options) {
        cookieStore.set({ name, value: '', ...options });
      }
    },
    headers: () => {
      const h = headers();
      return {
        'x-forwarded-for': h.get('x-forwarded-for') || '',
      };
    }
  });
}