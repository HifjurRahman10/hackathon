import { Inter } from 'next/font/google';
import './globals.css';
import { getUser } from '@/lib/db/queries';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'Hackathon App',
  description: 'Your hackathon project',
};

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Header />
        {children}
      </body>
    </html>
  );
}
