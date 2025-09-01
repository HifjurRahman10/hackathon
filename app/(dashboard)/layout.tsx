'use client';

import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { Button } from '@/components/ui/button';
import { CircleIcon, Home, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useRouter, usePathname } from 'next/navigation';
import { getBrowserSupabase } from '@/lib/auth/supabase-browser';
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js';

function getInitials(user: User | null): string {
  if (!user) return '?';
  const name = user.user_metadata?.full_name || user.user_metadata?.name || user.email || '';
  if (!name) return '?';
  const cleanName = name.replace(/@.*/, '');
  const parts = cleanName.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return cleanName.charAt(0).toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function UserMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = getBrowserSupabase();

  // Check DB for the user
  async function fetchDbUser(supabaseUser: User) {
    try {
      const res = await fetch(`/api/getUser?supabaseId=${supabaseUser.id}`);
      const userFromDb = await res.json();
      if (!userFromDb) {
        // Remove cookie/session if user doesn't exist in DB
        await supabase.auth.signOut();
        setUser(null);
      } else {
        setUser(supabaseUser);
      }
    } catch (err) {
      console.error('Error fetching DB user:', err);
      await supabase.auth.signOut();
      setUser(null);
    }
  }

  useEffect(() => {
    async function init() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          setUser(null);
        } else {
          await fetchDbUser(session.user);
        }
      } catch (err) {
        console.error('Error getting session:', err);
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        if (!session?.user) {
          setUser(null);
        } else {
          await fetchDbUser(session.user);
        }
        setLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      setUser(null);
      router.push('/');
      router.refresh();
    } catch (error) {
      console.error('Error signing out:', error);
    }
  }

  if (loading) {
    return <div className="h-9 w-9 rounded-full bg-gray-200 animate-pulse" />;
  }

  if (!user) {
    return (
      <>
        <Link
          href="/pricing"
          className="text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          Pricing
        </Link>
        <Link
          href="/sign-in"
          className="text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          Sign In
        </Link>
        <Button asChild className="rounded-full">
          <Link href="/sign-up">Sign Up</Link>
        </Button>
      </>
    );
  }

  return (
    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
      <DropdownMenuTrigger asChild>
        <button className="focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 rounded-full">
          <Avatar className="cursor-pointer size-9">
            <AvatarImage
              src={user.user_metadata?.avatar_url}
              alt={user.user_metadata?.full_name || user.email || ''}
            />
            <AvatarFallback className="bg-orange-500 text-white font-medium">
              {getInitials(user)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href="/dashboard" className="flex items-center cursor-pointer">
            <Home className="mr-2 h-4 w-4" />
            <span>Dashboard</span>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={handleSignOut}
          className="cursor-pointer text-red-600 focus:text-red-700"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Sign out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
          <CircleIcon className="h-6 w-6 text-orange-500" />
          <span className="ml-2 text-xl font-semibold text-gray-900">ACME</span>
        </Link>
        <div className="flex items-center space-x-4">
          <Suspense fallback={<div className="h-9 w-9 rounded-full bg-gray-200 animate-pulse" />}>
            <UserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboardPage = pathname?.startsWith('/dashboard');

  if (isDashboardPage) {
    return <section className="h-screen w-full">{children}</section>;
  }

  return (
    <section className="flex flex-col min-h-screen">
      <Header />
      {children}
    </section>
  );
}
