import { stripe } from '@/lib/payments/stripe';
import { db } from './drizzle';
import { users, teams, teamMembers } from './schema';

async function createStripeProducts() {
  console.log('Creating Stripe products and prices...');

  try {
    // Basic starter plan
    const starterProduct = await stripe.products.create({
      name: 'Starter Plan',
      description: 'Basic features for getting started',
    });

    await stripe.prices.create({
      product: starterProduct.id,
      unit_amount: 999, // $9.99
      currency: 'usd',
      recurring: { interval: 'month' },
    });

    // Pro plan
    const proProduct = await stripe.products.create({
      name: 'Pro Plan',
      description: 'Advanced features for power users',
    });

    await stripe.prices.create({
      product: proProduct.id,
      unit_amount: 1999, // $19.99
      currency: 'usd',
      recurring: { interval: 'month' },
    });

    console.log('Stripe products created successfully');
  } catch (error) {
    console.error('Error creating Stripe products:', error);
  }
}

async function seedDatabase() {
  console.log('Seeding database...');

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

  const [team] = await db
    .insert(teams)
    .values([
      {
        name: 'Sample Team',
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeProductId: null,
        planName: null,
        subscriptionStatus: 'inactive',
      },
    ])
    .returning();

  await db.insert(teamMembers).values([
    { teamId: team.id, userId: user1.id, role: 'owner' },
    { teamId: team.id, userId: user2.id, role: 'member' },
  ]);

  console.log('Database seeded successfully!');
}

async function main() {
  try {
    // Only run createStripeProducts in development or when explicitly requested
    if (
      process.env.NODE_ENV === 'development' ||
      process.env.CREATE_STRIPE_PRODUCTS === 'true'
    ) {
      await createStripeProducts();
    }
    await seedDatabase();
  } catch (error) {
    console.error('Error seeding:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { seedDatabase, createStripeProducts };
