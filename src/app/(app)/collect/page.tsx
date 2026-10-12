// v1.1 §1.1 — Collect was merged into Orders ("Balance due" filter does the same job).
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";

export default async function CollectRedirect() {
  const s = await requireSession();
  redirect(s.role === "OWNER" || s.role === "ADMIN" || s.role === "ACCOUNTS" ? "/dashboard" : "/home");
}
