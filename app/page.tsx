import { getUser } from '@/lib/db/queries';

export default async function HomePage() {
  const user = await getUser();

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-6">
          Welcome to Hackathon App
        </h1>
        
        {user ? (
          <div>
            <p className="text-xl mb-8">
              Hello {user.name || user.email}! Ready to get started?
            </p>
            <a 
              href="/dashboard" 
              className="bg-blue-600 text-white px-6 py-3 rounded-lg text-lg hover:bg-blue-700"
            >
              Go to Dashboard
            </a>
          </div>
        ) : (
          <div>
            <p className="text-xl mb-8">
              Get started with your hackathon project today!
            </p>
            <div className="space-x-4">
              <a 
                href="/sign-up" 
                className="bg-blue-600 text-white px-6 py-3 rounded-lg text-lg hover:bg-blue-700"
              >
                Get Started
              </a>
              <a 
                href="/sign-in" 
                className="border border-blue-600 text-blue-600 px-6 py-3 rounded-lg text-lg hover:bg-blue-50"
              >
                Sign In
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}