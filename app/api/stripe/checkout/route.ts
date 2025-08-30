import { eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { users, teams, teamMembers } from '@/lib/db/schema';
import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { getUser } from '@/lib/auth/session';
import { stripe } from '@/lib/payments/stripe';
import Stripe from 'stripe';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const sessionId = searchParams.get('session_id');

  if (!sessionId) {
    return NextResponse.redirect(new URL('/pricing', request.url));
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['customer', 'subscription'],
    });

    if (!session.customer || typeof session.customer === 'string') {
      throw new Error('Invalid customer data from Stripe.');
    }

    const customerId = session.customer.id;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription?.id;

    if (!subscriptionId) {
      throw new Error('No subscription found for this session.');
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    });

    const plan = subscription.items.data[0]?.price;

    if (!plan) {
      throw new Error('No plan found for this subscription.');
    }

    const productId = (plan.product as Stripe.Product).id;

    if (!productId) {
      throw new Error('No product ID found for this subscription.');
    }

    // Get userId from metadata instead of client_reference_id
    const userId = session.metadata?.userId;
    if (!userId) {
      throw new Error("No user ID found in session metadata.");
    }

    // Query by the UUID directly (userId is already a UUID string from metadata)
    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId)) // userId is already a UUID string
      .limit(1);

    if (user.length === 0) {
      throw new Error('User not found in database.');
    }

    const userTeam = await db
      .select({
        teamId: teamMembers.teamId,
      })
      .from(teamMembers)
      .where(eq(teamMembers.userId, user[0].id))
      .limit(1);

    if (userTeam.length === 0) {
      throw new Error('User is not associated with any team.');
    }

    await db
      .update(teams)
      .set({
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
        stripeProductId: productId,
        planName: (plan.product as Stripe.Product).name,
        subscriptionStatus: subscription.status,
        updatedAt: new Date(),
      })
      .where(eq(teams.id, userTeam[0].teamId));

    return NextResponse.redirect(new URL('/dashboard', request.url));
  } catch (error) {
    console.error('Error handling successful checkout:', error);
    return NextResponse.redirect(new URL('/error', request.url));
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await getUser();

    if (!user) {
      return NextResponse.json(
        {
          error: 'You must be logged in to access this endpoint',
        },
        { status: 401 }
      );
    }

    const { price, quantity = 1, metadata = {} } = await request.json();

    // Query by supabaseId (text field) to find the user
    const dbUser = await db
      .select()
      .from(users)
      .where(eq(users.supabaseId, user.id)) // Both are strings now
      .limit(1);

    if (dbUser.length === 0) {
      return NextResponse.json(
        {
          error: 'User not found in database',
        },
        { status: 404 }
      );
    }

    const session = await stripe.checkout.sessions.create({
      billing_address_collection: 'required',
      line_items: [
        {
          price: price,
          quantity: quantity,
        },
      ],
      mode: 'subscription',
      success_url: `${request.headers.get('origin')}/api/stripe/checkout?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.headers.get('origin')}/dashboard/pricing?canceled=true`,
      customer_email: user.email,
      metadata: {
        userId: dbUser[0].id, // This is the UUID string from your database
        supabaseId: user.id, // The Supabase user ID
        ...metadata,
      },
    });

    return NextResponse.json({
      url: session.url,
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    return NextResponse.json(
      {
        error: 'Failed to create checkout session',
      },
      { status: 500 }
    );
  }
}