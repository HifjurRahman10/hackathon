'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Users, Settings, Shield, Activity, Menu } from 'lucide-react';

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
   <div className="flex flex-col h-screen max-w-7xl mx-auto w-full">
  <div className="flex flex-1 overflow-hidden">
    <main className="flex-1 overflow-hidden">{children}</main>
  </div>
</div>
  );
}
