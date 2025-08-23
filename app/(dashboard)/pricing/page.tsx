import { checkoutAction } from '@/lib/payments/actions';
import { SubmitButton } from './submit-button';

export default function PricingPage() {
  return (
    <div className="max-w-4xl mx-auto py-8">
      <h1 className="text-3xl font-bold text-center mb-8">Choose Your Plan</h1>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Starter</h2>
          <p className="text-3xl font-bold mb-4">
            $9.99
            <span className="text-sm font-normal">/month</span>
          </p>
          <ul className="mb-6 space-y-2">
            <li>✓ Basic features</li>
            <li>✓ Up to 5 team members</li>
            <li>✓ Email support</li>
          </ul>
          <form action={checkoutAction}>
            <input type="hidden" name="priceId" value="price_starter" />
            <SubmitButton>Choose Starter</SubmitButton>
          </form>
        </div>

        <div className="border rounded-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Pro</h2>
          <p className="text-3xl font-bold mb-4">
            $19.99
            <span className="text-sm font-normal">/month</span>
          </p>
          <ul className="mb-6 space-y-2">
            <li>✓ All starter features</li>
            <li>✓ Unlimited team members</li>
            <li>✓ Priority support</li>
            <li>✓ Advanced analytics</li>
          </ul>
          <form action={checkoutAction}>
            <input type="hidden" name="priceId" value="price_pro" />
            <SubmitButton>Choose Pro</SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
