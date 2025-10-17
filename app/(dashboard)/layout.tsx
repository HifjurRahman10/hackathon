'use client';

import Link from 'next/link';
import { Suspense } from 'react';
import { CircleIcon } from 'lucide-react';
import { usePathname } from 'next/navigation';
import {
  LandingUserMenu,
  LandingUserMenuSkeleton
} from '@/components/landing-user-menu';

function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <Link href="/" className="flex items-center hover:opacity-80 transition-opacity">
          <CircleIcon className="h-6 w-6 text-orange-500" />
          <span className="ml-2 text-xl font-semibold text-gray-900">ACME</span>
        </Link>
        <div className="flex items-center space-x-4">
          <Suspense fallback={<LandingUserMenuSkeleton />}>
            <LandingUserMenu />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isDashboardPage = pathname?.startsWith('/dashboard');

  if (isDashboardPage) return <section className="h-screen w-full">{children}</section>;

  return (
    <section className="flex flex-col min-h-screen">
      <Header />
      {children}
    </section>
  );
}
