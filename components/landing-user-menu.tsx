'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Home, LogOut } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { getBrowserSupabase } from '@/lib/auth/supabase-browser';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';

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

export function LandingUserMenuSkeleton() {
  return <div className="h-9 w-9 rounded-full bg-gray-200 animate-pulse" />;
}

export function LandingUserMenu() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const supabase = useMemo(() => getBrowserSupabase(), []);

  useEffect(() => {
    let isActive = true;

    async function init() {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        const currentUser = session?.user || null;

        if (currentUser) {
          const { data: dbUser, error } = await supabase
            .from('users')
            .select('id')
            .eq('id', currentUser.id)
            .single();

          if (!dbUser || error) {
            await supabase.auth.signOut();
            if (isActive) {
              setUser(null);
            }
          } else if (isActive) {
            setUser(currentUser);
          }
        } else if (isActive) {
          setUser(null);
        }
      } catch (err) {
        console.error('Error initializing user session:', err);
        if (isActive) {
          setUser(null);
        }
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    }

    init();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        if (!isActive) return;
        setUser(session?.user || null);
        setLoading(false);
      }
    );

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleSignOut() {
    try {
      await supabase.auth.signOut();
      setIsMenuOpen(false);
      router.push('/');
      router.refresh();
    } catch (err) {
      console.error('Error signing out:', err);
    }
  }

  if (loading) {
    return <LandingUserMenuSkeleton />;
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
