import './globals.css';
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> parent of 335c88d (hdhf)
import type { Metadata, Viewport } from 'next';
import { Manrope } from 'next/font/google';
import { getUser, getTeamForUser } from '@/lib/db/queries';
import { SWRConfig } from 'swr';
import { SpeedInsights } from '@vercel/speed-insights/next';
<<<<<<< HEAD
=======
import { getUser } from '@/lib/db/queries';
>>>>>>> parent of 4a0c42e (hdhf)
=======
>>>>>>> parent of 335c88d (hdhf)

export const metadata: Metadata = {
  title: 'Next.js SaaS Starter',
  description: 'Get started quickly with Next.js, Postgres, and Stripe.'
};

<<<<<<< HEAD
<<<<<<< HEAD
export const viewport: Viewport = {
  maximumScale: 1
};

const manrope = Manrope({ subsets: ['latin'] });
=======
async function Header() {
  const user = await getUser();

  return (
    <header className="border-b">
      <div className="container mx-auto px-4 py-4 flex justify-between items-center">
        <div className="font-bold text-xl">Hackathon</div>
        
        <nav className="flex items-center gap-4">
          {user ? (
            <div className="flex items-center gap-4">
              <span>Welcome, {user.name || user.email}</span>
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm">
                {(user.name || user.email)?.[0]?.toUpperCase()}
              </div>
              <a href="/dashboard" className="text-blue-600 hover:underline">
                Dashboard
              </a>
              <form action="/auth/sign-out" method="post" className="inline">
                <button type="submit" className="text-red-600 hover:underline">
                  Sign Out
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-4">
              <a href="/sign-in" className="text-blue-600 hover:underline">
                Sign In
              </a>
              <a href="/sign-up" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                Sign Up
              </a>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
>>>>>>> parent of 4a0c42e (hdhf)
=======
export const viewport: Viewport = {
  maximumScale: 1
};

const manrope = Manrope({ subsets: ['latin'] });
>>>>>>> parent of 335c88d (hdhf)

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
<<<<<<< HEAD
<<<<<<< HEAD
=======
>>>>>>> parent of 335c88d (hdhf)
    <html
      lang="en"
      className={`bg-white dark:bg-gray-950 text-black dark:text-white ${manrope.className}`}
    >
      <body className="min-h-[100dvh] bg-gray-50">
        <SWRConfig
          value={{
            fallback: {
              // We do NOT await here
              // Only components that read this data will suspend
              '/api/user': getUser(),
              '/api/team': getTeamForUser()
            }
          }}
        >
          {children}
          <SpeedInsights />
        </SWRConfig>
<<<<<<< HEAD
=======
    <html lang="en">
      <body className={inter.className}>
        <Header />
        {children}
>>>>>>> parent of 4a0c42e (hdhf)
=======
>>>>>>> parent of 335c88d (hdhf)
      </body>
    </html>
  );
}
