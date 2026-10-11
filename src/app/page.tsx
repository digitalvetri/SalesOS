import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";

export default async function Root() {
  const session = await getSession();
  redirect(session ? "/home" : "/login");
}
