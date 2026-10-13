"use client";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ChevronDown, Download, LogOut, Moon, Sun, UserRound } from "lucide-react";
import { THEME_COOKIE } from "@/config/theme";
import type { SessionUser } from "@/server/repo/users";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";
}

export function UserMenu({ user }: { user: SessionUser }) {
  const router = useRouter();
  const t = useTranslations();

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
          aria-label={`Account menu for ${user.name}`}
          className="flex h-10 items-center gap-2 rounded-full border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-1 pr-1 text-sm font-semibold text-[color:var(--color-nav-ink)] shadow-[var(--shadow-1)] transition-colors hover:bg-[color:var(--color-surface-2)] md:pr-3"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--color-accent)] text-xs font-semibold text-white">
            {initials(user.name)}
          </span>
          <span className="hidden max-w-[10rem] truncate md:inline">{user.name.split(/\s+/)[0]}</span>
          <ChevronDown className="hidden h-4 w-4 text-[color:var(--color-ink-3)] md:block" aria-hidden />
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
          <DropdownMenu.Item asChild>
            <Link
              href="/profile"
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 outline-none hover:bg-[color:var(--color-surface-2)]"
            >
              <UserRound className="h-4 w-4" aria-hidden />
              My profile
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item asChild>
            <Link
              href="/profile#install"
              className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 outline-none hover:bg-[color:var(--color-surface-2)]"
            >
              <Download className="h-4 w-4" aria-hidden />
              Install app
            </Link>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            onSelect={toggleTheme}
            className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 hover:bg-[color:var(--color-surface-2)]"
          >
            <Moon className="h-4 w-4 dark-hidden" aria-hidden />
            <Sun className="h-4 w-4 light-hidden" aria-hidden />
            {t("common.toggleTheme")}
          </DropdownMenu.Item>
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
