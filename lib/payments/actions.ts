'use server';

import { redirect } from 'next/navigation';
import { withTeam } from '@/lib/auth/middleware';
import { createCheckoutSession, createCustomerPortalSession } from './stripe';

export const checkoutAction = withTeam(async (formData, team) => {
  const priceId = formData.get('priceId');
  if (typeof priceId !== 'string' || !priceId) {
    throw new Error('Missing priceId');
  }
  const url = await createCheckoutSession({ team, priceId });
  redirect(url);
});

export const customerPortalAction = withTeam(async (_formData, team) => {
  const customerId = team.stripeCustomerId;
  if (!customerId) {
    throw new Error('No Stripe customer found');
  }
  const url = await createCustomerPortalSession(customerId);
  redirect(url);
});
