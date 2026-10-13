import { NextResponse } from "next/server";
import { destroyCurrentSession } from "@/server/auth/session";

export async function POST() {
  await destroyCurrentSession();
  return NextResponse.json({ ok: true });
}
