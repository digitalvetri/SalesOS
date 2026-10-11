"use client";
import * as React from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Bell, Check } from "lucide-react";

type NotificationItem = {
  id: string;
  kind: string;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
};

export function NotificationBell() {
  const [items, setItems] = React.useState<NotificationItem[]>([]);
  const [unread, setUnread] = React.useState(0);
  const [open, setOpen] = React.useState(false);

  const refresh = React.useCallback(async () => {
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as {
        ok: true;
        data: { items: NotificationItem[]; unread: number };
      };
      if (body.ok) {
        setItems(body.data.items);
        setUnread(body.data.unread);
      }
    } catch {
      // network blip — try again on next poll
    }
  }, []);

  // Poll every 30s. Defer the first fetch to a microtask so no state update
  // runs synchronously inside the effect's commit phase.
  React.useEffect(() => {
    const kick = window.setTimeout(() => void refresh(), 0);
    const t = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(t);
    };
  }, [refresh]);

  // Fresh pull on dropdown open — same microtask deferral.
  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(t);
  }, [open, refresh]);

  async function markRead(id: string) {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read", id }),
    });
    void refresh();
  }

  async function markAll() {
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "read-all" }),
    });
    void refresh();
  }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen}>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label={`Notifications${unread > 0 ? `: ${unread} unread` : ""}`}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface-2)] text-[color:var(--color-ink-2)] hover:bg-[color:var(--color-surface)]"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[color:var(--color-danger)] px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-40 w-80 overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] text-sm shadow-[var(--shadow-2)]"
        >
          <header className="flex items-center justify-between border-b border-[color:var(--color-border)] px-3 py-2">
            <span className="label-caps">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAll}
                className="text-xs text-[color:var(--color-ink-2)] hover:underline"
              >
                Mark all read
              </button>
            )}
          </header>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-[color:var(--color-ink-3)]">
              You&apos;re all caught up.
            </p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`border-b border-[color:var(--color-border)] last:border-b-0 ${
                    n.readAt ? "" : "bg-[color:var(--color-info-bg)]/40"
                  }`}
                >
                  <Link
                    href={n.link}
                    onClick={() => void markRead(n.id)}
                    className="flex items-start gap-3 px-3 py-2 hover:bg-[color:var(--color-surface-2)]"
                  >
                    <div className="flex-1">
                      <div className="font-medium">{n.title}</div>
                      <div className="mt-0.5 text-xs text-[color:var(--color-ink-3)]">
                        {n.body}
                      </div>
                    </div>
                    {n.readAt && <Check className="h-3 w-3 text-[color:var(--color-ink-3)]" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
