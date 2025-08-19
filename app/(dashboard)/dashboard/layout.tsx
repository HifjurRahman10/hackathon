'use client';

import { usePathname } from 'next/navigation';

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