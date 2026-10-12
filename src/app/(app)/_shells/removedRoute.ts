import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";

/** v1.1 §1.1: screens removed from the UI send people to their Overview. */
export async function redirectToOverview(): Promise<never> {
  const s = await requireSession();
  redirect(s.role === "OWNER" || s.role === "ADMIN" || s.role === "ACCOUNTS" ? "/dashboard" : "/home");
}
