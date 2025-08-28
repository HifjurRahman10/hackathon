import Stripe from 'stripe';
import {
  getTeamByStripeCustomerId,
  updateTeamSubscription
} from '@/lib/db/queries';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-04-30.basil'
});

// Make all non‑used fields optional; allow teamMembers
export type BillingTeam = {
  id: number;
  name: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripeProductId?: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  teamMembers?: { id: number; name: string | null; email: string }[];
};

export async function createCheckoutSession({
  team,
  priceId
}: {
  team: BillingTeam;
  priceId: string;
}) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/dashboard?success=1`,
    cancel_url: `${baseUrl}/pricing?canceled=1`,
    client_reference_id: String(team.id),
    
    metadata: { teamId: String(team.id) }
  });
  if (!session.url) throw new Error('No checkout session URL from Stripe');
  return session.url;
}

export async function createCustomerPortalSession(customerId: string): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${baseUrl}/dashboard`
  });
  if (!session.url) throw new Error('No portal session URL from Stripe');
  return session.url;
}

export async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  const team = await getTeamByStripeCustomerId(customerId);
  if (!team) {
    console.error('Team not found for Stripe customer:', customerId);
    return;
  }
  const firstItem = subscription.items.data[0];
  const price = firstItem?.price;
  const productRef = price?.product;

  let productId: string | null = null;
  let productName: string | null = null;
  if (typeof productRef === 'string') {
    productId = productRef;
  } else if (productRef) {
    productId = productRef.id;
    // @ts-ignore name may not be expanded
    productName = productRef.name ?? null;
  }

  const status = subscription.status;
  if (status === 'active' || status === 'trialing') {
    await updateTeamSubscription(team.id, {
      stripeSubscriptionId: subscription.id,
      stripeProductId: productId,
      planName: productName,
      subscriptionStatus: status
    });
  } else if (
    status === 'canceled' ||
    status === 'unpaid' ||
    status === 'incomplete_expired' ||
    status === 'past_due'
  ) {
    await updateTeamSubscription(team.id, {
      stripeSubscriptionId: null,
      stripeProductId: null,
      planName: null,
      subscriptionStatus: status
    });
  }
}

export async function getStripePrices() {
  const prices = await stripe.prices.list({
    expand: ['data.product'],
    active: true,
    type: 'recurring'
  });
  return prices.data.map(p => ({
    id: p.id,
    productId: typeof p.product === 'string' ? p.product : p.product.id,
    unitAmount: p.unit_amount,
    currency: p.currency,
    interval: p.recurring?.interval,
    trialPeriodDays: p.recurring?.trial_period_days
  }));
}

export async function getStripeProducts() {
  const products = await stripe.products.list({
    active: true,
    expand: ['data.default_price']
  });
  return products.data.map(prod => ({
    id: prod.id,
    name: prod.name,
    description: prod.description,
    defaultPriceId:
      typeof prod.default_price === 'string'
        ? prod.default_price
        : prod.default_price?.id
  }));
}
