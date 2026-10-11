"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { LogOut, Moon, Sun } from "lucide-react";
import { THEME_COOKIE } from "@/config/theme";
import type { SessionUser } from "@/server/repo/users";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const t = useTranslations();

  // §10.1: dark theme is an explicit opt-in for Owner/Admin (desktop dashboards).
  const canTheme = user.role === "OWNER" || user.role === "ADMIN";
  function toggleTheme() {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.cookie = `${THEME_COOKIE}=${dark ? "dark" : "light"}; path=/; max-age=31536000; samesite=lax`;
    if (dark) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    router.refresh();
  }

  async function signOut() {
    await fetch("/api/auth/signout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={user.name}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-nav-border)] bg-[color:var(--color-nav-bg-2)] text-xs font-semibold text-[color:var(--color-nav-accent)] hover:bg-[color:var(--color-nav-active-bg)]"
        >
          {initials(user.name)}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-40 min-w-[200px] rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] p-1 text-sm shadow-[var(--shadow-2)]"
        >
          <div className="px-3 py-2">
            <div className="font-medium">{user.name}</div>
            <div className="text-xs text-[color:var(--color-ink-3)]">{user.role}</div>
          </div>
          <DropdownMenu.Separator className="my-1 h-px bg-[color:var(--color-border)]" />
          {canTheme && (
            <DropdownMenu.Item
              onSelect={toggleTheme}
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 hover:bg-[color:var(--color-surface-2)]"
            >
              <Moon className="h-4 w-4 dark-hidden" aria-hidden />
              <Sun className="h-4 w-4 light-hidden" aria-hidden />
              {t("common.toggleTheme")}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Item
            onSelect={signOut}
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 hover:bg-[color:var(--color-surface-2)]"
          >
            <LogOut className="h-4 w-4" />
            {t("common.signOut")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
