import { NextResponse } from "next/server";
import { prisma } from "@/server/repo/client";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up" });
  } catch (e) {
    // Log details server-side only; the public response stays generic.
    console.error("[health] db check failed", e);
    return NextResponse.json({ ok: false, db: "down" }, { status: 503 });
  }
}
