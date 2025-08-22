import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db/drizzle";
import { files } from "@/lib/db/schema";
import { getUser } from "@/lib/db/queries";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  await db.insert(files).values({
    userId: user.id,
    path: body.path,
    name: body.name,
    type: body.type,
    size: body.size,
  });

  return NextResponse.json({ success: true });
}
