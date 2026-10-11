import { getTranslations } from "next-intl/server";
import { ClipboardList, LayoutGrid, CircleUser } from "lucide-react";
import { TopBar } from "./TopBar";
import { MobileNavItem } from "./MobileNavItem";
import type { SessionUser } from "@/server/repo/users";

export async function MobileDispatchShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const t = await getTranslations();
  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar user={user} />
      <main className="flex-1 pb-20">{children}</main>
      <nav
        role="navigation"
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-20 flex h-16 border-t border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
      >
        <MobileNavItem href="/home" icon={<ClipboardList className="h-5 w-5" />} label={t("common.queue")} />
        <MobileNavItem href="/dispatch" icon={<LayoutGrid className="h-5 w-5" />} label={t("common.board")} />
        <MobileNavItem disabled icon={<CircleUser className="h-5 w-5" />} label={t("common.me")} />
      </nav>
    </div>
  );
}
