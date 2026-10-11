"use client";
import * as React from "react";
import { Mail, Pencil, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "@/components/app/Toast";
import { updateUserEmailAction } from "@/app/(app)/settings/users/actions";

export function EmailField({ userId, email }: { userId: string; email: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(email ?? "");
  const [pending, setPending] = React.useState(false);

  async function save() {
    if (pending) return;
    const next = value.trim().toLowerCase();
    if (next === (email ?? "").toLowerCase()) {
      setEditing(false);
      return;
    }
    setPending(true);
    try {
      const r = await updateUserEmailAction({ userId, email: next });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success("Email updated.");
      setEditing(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <div className="group mt-1 flex items-center gap-1.5 text-xs text-[color:var(--color-ink-3)]">
        <Mail className="h-3.5 w-3.5" aria-hidden />
        <span className="truncate">{email ?? "—"}</span>
        <button
          type="button"
          aria-label="Edit email"
          onClick={() => {
            setValue(email ?? "");
            setEditing(true);
          }}
          className="rounded p-0.5 opacity-0 transition-opacity hover:bg-[color:var(--color-surface-2)] hover:text-[color:var(--color-ink)] group-hover:opacity-100 focus-visible:opacity-100"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <form
      className="mt-1 flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Mail className="h-3.5 w-3.5 text-[color:var(--color-ink-3)]" aria-hidden />
      <input
        type="email"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        disabled={pending}
        className="min-w-0 flex-1 rounded-sm border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-0.5 text-xs"
      />
      <button
        type="submit"
        aria-label="Save"
        disabled={pending || !value.trim()}
        className="rounded p-1 text-[color:var(--color-ok)] hover:bg-[color:var(--color-ok-bg)] disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Cancel"
        onClick={() => {
          setValue(email ?? "");
          setEditing(false);
        }}
        className="rounded p-1 text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
