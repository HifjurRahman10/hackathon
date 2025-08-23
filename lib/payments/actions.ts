'use server';

import { redirect } from 'next/navigation';
import { createCheckoutSession, createCustomerPortalSession } from './stripe';
import { withTeam } from '@/lib/auth/middleware';

export const checkoutAction = withTeam(async (formData, team) => {
  const priceId = formData.get('priceId');
  if (typeof priceId !== 'string' || !priceId) {
    throw new Error('Missing priceId');
  }
  const checkoutUrl = await createCheckoutSession({ team, priceId });
  redirect(checkoutUrl);
});

export const customerPortalAction = withTeam(async (_formData, team) => {
  if (!team.stripeCustomerId) {
    throw new Error('No Stripe customer found');
  }
  const portalUrl = await createCustomerPortalSession(team.stripeCustomerId);
  redirect(portalUrl);
});