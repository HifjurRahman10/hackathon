'use client';

import { usePathname } from 'next/navigation';

export default function DashboardLayout({
  children
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen w-full bg-background text-foreground">
      <main className="flex-1 mx-auto max-w-7xl h-full">{children}</main>
    </div>
  );
}
