'use server';

import { redirect } from 'next/navigation';
import { createCheckoutSession } from './stripe';
import { getUser } from '@/lib/auth/session';
import { getUserWithTeam } from '@/lib/db/queries';

// Type guard helpers (safe even if shapes differ slightly)
function hasTeam(obj: any): obj is { team: any } {
  return obj && typeof obj === 'object' && 'team' in obj;
}

export const checkoutAction = async (formData: FormData) => {
  const priceId = formData.get('priceId') as string;
  if (!priceId) throw new Error('Missing priceId');

  // 1. Get authenticated Supabase user
  const supabaseUser = await getUser();
  if (!supabaseUser) throw new Error('Not authenticated');

  // 2. Fetch team info using supabase user id (pass required param)
  const userWithTeam = await getUserWithTeam(supabaseUser.id);
  if (!userWithTeam) throw new Error('User or team not found');

  // 3. Normalise team object (handle both return shapes)
  const teamData = hasTeam(userWithTeam) ? userWithTeam.team : userWithTeam;

  if (!teamData) throw new Error('Team data missing');

  // 4. Ensure teamMembers array exists (fallback to empty)
  const team = {
    id: teamData.id,
    name: teamData.name,
    stripeCustomerId: teamData.stripeCustomerId ?? null,
    stripeSubscriptionId: teamData.stripeSubscriptionId ?? null,
    planName: teamData.planName ?? null,
    subscriptionStatus: teamData.subscriptionStatus ?? null,
    teamMembers: (teamData.teamMembers || []).map((m: any) => ({
      id: m.id,          // user UUID (string)
      name: m.name ?? null,
      email: m.email,
    })),
  };

  // 5. Create Stripe checkout session
  const checkoutUrl = await createCheckoutSession({ team, priceId });

  redirect(checkoutUrl);
};