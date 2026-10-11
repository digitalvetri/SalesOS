// v1.1 §1.1 — Customers page removed. A Customer side-panel (§5.4) will open
// from any customer name in the Orders sheet (built in a later phase).
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";

export default async function CustomersRedirect() {
  const s = await requireSession();
  redirect(s.role === "OWNER" || s.role === "ADMIN" || s.role === "ACCOUNTS" ? "/dashboard" : "/home");
}
