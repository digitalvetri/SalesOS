import { BRAND } from "@/config/brand";
import { LogoMark } from "@/components/app/Logo";
import { NotificationBell } from "@/components/app/NotificationBell";
import { UserMenu } from "./UserMenu";
import type { SessionUser } from "@/server/repo/users";

export function TopBar({ user }: { user: SessionUser }) {
  const firstName = user.name.split(/\s+/)[0] ?? user.name;
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[color:var(--color-nav-border)] bg-[color:var(--color-surface)] px-4 text-[color:var(--color-nav-ink)] md:h-[72px] md:px-6 xl:px-8">
      {/* Brand on phones only — the side nav carries it from 768 px up. */}
      <div className="flex items-center gap-2 md:hidden">
        <LogoMark size={32} />
        <span className="text-base font-bold tracking-tight">{BRAND.name}</span>
      </div>
      <p className="hidden truncate text-base text-[color:var(--color-nav-ink-3)] md:block">
        Hi <span className="font-semibold text-[color:var(--color-nav-ink)]">{firstName}</span> 👋
      </p>
      <div className="flex items-center gap-2 md:gap-3">
        <NotificationBell />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
