'use server';

import { redirect } from 'next/navigation';
import { createCheckoutSession } from './stripe';
import { getUser } from '@/lib/auth/session';
import { getUserWithTeam } from '@/lib/db/queries';
import { db } from '@/lib/db/drizzle';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

// Type guard helpers (safe even if shapes differ slightly)
function hasTeam(obj: any): obj is { team: any } {
  return obj && typeof obj === 'object' && 'team' in obj;
}

export const checkoutAction = async (formData: FormData) => {
  const priceId = formData.get('priceId') as string;
  if (!priceId) throw new Error('Missing priceId');

  // 1. Get authenticated Supabase user (UUID string)
  const supabaseUser = await getUser();
  if (!supabaseUser) throw new Error('Not authenticated');

  // 2. Map Supabase user (uuid) to local numeric users.id
  const local = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.supabaseId, supabaseUser.id))
    .limit(1);

  if (local.length === 0) throw new Error('Local user not found');
  const localUserId = local[0].id; // number

  // 3. Fetch team info using numeric local user id
  const userWithTeam = await getUserWithTeam(localUserId);
  if (!userWithTeam) throw new Error('User or team not found');

  // 4. Normalise team object
  const teamData = hasTeam(userWithTeam) ? userWithTeam.team : userWithTeam;
  if (!teamData) throw new Error('Team data missing');

  // 5. Ensure teamMembers array exists (fallback to empty)
  const team = {
    id: teamData.id,
    name: teamData.name,
    stripeCustomerId: teamData.stripeCustomerId ?? null,
    stripeSubscriptionId: teamData.stripeSubscriptionId ?? null,
    planName: teamData.planName ?? null,
    subscriptionStatus: teamData.subscriptionStatus ?? null,
    teamMembers: (teamData.teamMembers || []).map((m: any) => ({
      id: m.id,
      name: m.name ?? null,
      email: m.email,
    })),
  };

  // 6. Create Stripe checkout session
  const checkoutUrl = await createCheckoutSession({ team, priceId });

  redirect(checkoutUrl);
};