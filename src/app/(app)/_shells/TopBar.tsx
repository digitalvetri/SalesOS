import { BRAND } from "@/config/brand";
import { LangToggle } from "@/components/app/LangToggle";
import { UserMenu } from "./UserMenu";
import type { SessionUser } from "@/server/repo/users";

export function TopBar({ user, title }: { user: SessionUser; title?: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-[color:var(--color-border)] bg-[color:var(--color-surface)]/95 px-4 backdrop-blur">
      <div className="flex items-baseline gap-3">
        <span className="text-base font-semibold tracking-tight">{BRAND.name}</span>
        {title && (
          <span className="hidden text-sm text-[color:var(--color-ink-3)] md:inline">· {title}</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <LangToggle />
        <UserMenu user={user} />
      </div>
    </header>
  );
}
