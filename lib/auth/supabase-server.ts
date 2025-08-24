import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// This is the function that's missing and being imported in actions.ts
export function createServerSupabase() {
  const cookieStore = cookies();
  
  return createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    },
    global: {
      headers: {
        Cookie: cookieStore.toString()
      }
    }
  });
}

// This is the same as getServerSupabase but with the name expected by your imports
export const getServerSupabase = createServerSupabase;

// Middleware Supabase client
export function createMiddlewareSupabase(request: NextRequest) {
  const response = NextResponse.next();
  
  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false
    },
    global: {
      headers: {
        cookie: request.headers.get('cookie') || ''
      }
    }
  });
  
  return { supabase, response };
}