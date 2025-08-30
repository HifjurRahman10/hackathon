import Stripe from 'stripe';
import {
  getTeamByStripeCustomerId,
  updateTeamSubscription
} from '@/lib/db/queries';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia'
});

// Updated BillingTeam type to match your UUID schema
export type BillingTeam = {
  id: number;
  name: string;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  planName: string | null;
  subscriptionStatus: string | null;
  teamMembers: {
    id: string; // Changed from number to string to match UUID
    name: string | null;
    email: string;
  }[];
};

export async function createCheckoutSession({
  team,
  priceId
}: {
  team: BillingTeam;
  priceId: string;
}) {
  const origin = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [
      {
        price: priceId,
        quantity: 1
      }
    ],
    success_url: `${origin}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/dashboard/pricing?canceled=true`,
    metadata: {
      teamId: team.id.toString(),
      // Store one of the team member IDs for user reference
      userId: team.teamMembers[0]?.id || ''
    }
  });

  if (!session.url) {
    throw new Error('Failed to create checkout session');
  }

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
