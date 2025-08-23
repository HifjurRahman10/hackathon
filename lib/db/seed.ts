import { stripe } from '@/lib/payments/stripe';
import { db } from './drizzle';
import { users, teams, teamMembers } from './schema';

async function createStripeProducts() {
  console.log('Creating Stripe products and prices...');

  const baseProduct = await stripe.products.create({
    name: 'Base',
    description: 'Base subscription plan',
  });

  await stripe.prices.create({
    product: baseProduct.id,
    unit_amount: 800, // $8 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  const plusProduct = await stripe.products.create({
    name: 'Plus',
    description: 'Plus subscription plan',
  });

  await stripe.prices.create({
    product: plusProduct.id,
    unit_amount: 1200, // $12 in cents
    currency: 'usd',
    recurring: {
      interval: 'month',
      trial_period_days: 7,
    },
  });

  console.log('Stripe products and prices created successfully.');
}

async function seedDatabase() {
  console.log('Seeding database...');

  // Insert sample users without password hashing since you're using Supabase auth
  const [user1, user2] = await db
    .insert(users)
    .values([
      {
        email: 'admin@example.com',
        name: 'Admin User',
        supabaseId: 'sample-supabase-id-1',
        role: 'owner',
      },
      {
        email: 'member@example.com',
        name: 'Member User',
        supabaseId: 'sample-supabase-id-2',
        role: 'member',
      },
    ])
    .returning();

  // Insert sample team
  const [team] = await db
    .insert(teams)
    .values([
      {
        name: 'Sample Team',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        planName: null,
        subscriptionStatus: 'inactive',
      },
    ])
    .returning();

  // Insert team members
  await db.insert(teamMembers).values([
    {
      teamId: team.id,
      userId: user1.id,
    },
    {
      teamId: team.id,
      userId: user2.id,
    },
  ]);

  console.log('Database seeded successfully!');
}

async function main() {
  try {
    await createStripeProducts();
    await seedDatabase();
  } catch (error) {
    console.error('Error seeding database:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { seedDatabase, createStripeProducts };
