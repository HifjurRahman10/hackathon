import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db/drizzle';
import { finalVideo, chats, users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user from database
    const user = await db
      .select()
      .from(users)
      .where(eq(users.supabaseId, session.user.id))
      .limit(1);

    if (!user[0]) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get final videos for user's chats
    const videos = await db
      .select({
        id: finalVideo.id,
        chatId: finalVideo.chatId,
        videoUrl: finalVideo.videoUrl,
        chatTitle: chats.title,
      })
      .from(finalVideo)
      .innerJoin(chats, eq(finalVideo.chatId, chats.id))
      .where(eq(chats.userId, user[0].id))
      .orderBy(finalVideo.id);

    // Transform to match component interface
    const transformedVideos = videos.map(video => ({
      id: video.id,
      chatId: video.chatId,
      videoUrl: video.videoUrl,
      chat: {
        title: video.chatTitle,
      },
    }));

    return NextResponse.json(transformedVideos);
  } catch (error) {
    console.error('Failed to fetch final videos:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
