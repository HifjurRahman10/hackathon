import { Suspense } from 'react';
import { Login } from '../login';

export default function SignUpPage() {
  return (
    <Suspense>
      <Login mode="signup" />
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && !pending && typeof (window as any).__lastSignupSuccess === 'string' && (
        <p className="text-sm text-green-600">{(window as any).__lastSignupSuccess}</p>
      )}
    </Suspense>
  );
}
