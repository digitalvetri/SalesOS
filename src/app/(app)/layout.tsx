import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { MobileSalesShell } from "./_shells/MobileSalesShell";
import { MobileDispatchShell } from "./_shells/MobileDispatchShell";
import { DesktopOwnerAdminShell } from "./_shells/DesktopOwnerAdminShell";
import { DesktopAccountsShell } from "./_shells/DesktopAccountsShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let session;
  try {
    session = await requireSession();
  } catch {
    redirect("/login");
  }

  switch (session.role) {
    case "SALES":
      return <MobileSalesShell user={session.user}>{children}</MobileSalesShell>;
    case "DISPATCH":
      return <MobileDispatchShell user={session.user}>{children}</MobileDispatchShell>;
    case "ACCOUNTS":
      return <DesktopAccountsShell user={session.user}>{children}</DesktopAccountsShell>;
    case "OWNER":
    case "ADMIN":
    default:
      return <DesktopOwnerAdminShell user={session.user}>{children}</DesktopOwnerAdminShell>;
  }
}
