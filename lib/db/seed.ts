import { db } from './drizzle';
import { users, teams, teamMembers } from './schema';

async function seedDatabase() {
  console.log('Seeding database...');

  try {
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
  } catch (error) {
    console.error('Error seeding:', error);
  }
}

async function createStripeProducts() {
  console.log('Stripe products creation skipped in build');
}

async function main() {
  await seedDatabase();
}

if (require.main === module) {
  main();
}

export { seedDatabase, createStripeProducts };
