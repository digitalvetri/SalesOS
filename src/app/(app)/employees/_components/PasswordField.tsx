"use client";
import * as React from "react";
import { KeyRound, Check, X, Eye, EyeOff } from "lucide-react";
import { toast } from "@/components/app/Toast";
import { setPasswordAction } from "@/app/(app)/settings/users/actions";

export function PasswordField({ userId }: { userId: string }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function save() {
    if (pending) return;
    if (value.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      const r = await setPasswordAction({ userId, password: value });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success("Password updated.");
      setEditing(false);
      setValue("");
    } finally {
      setPending(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex items-center gap-1.5 text-xs text-[color:var(--color-ink-2)] hover:text-[color:var(--color-ink)] hover:underline"
      >
        <KeyRound className="h-3.5 w-3.5" />
        Set password
      </button>
    );
  }

  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <KeyRound className="h-3.5 w-3.5 text-[color:var(--color-ink-3)]" aria-hidden />
      <div className="relative min-w-0 flex-1">
        <input
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          disabled={pending}
          placeholder="New password"
          className="w-full rounded-sm border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-2 py-0.5 pr-7 text-xs"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-6 items-center justify-center text-[color:var(--color-ink-3)]"
        >
          {show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </button>
      </div>
      <button
        type="submit"
        aria-label="Save"
        disabled={pending || value.length < 8}
        className="rounded p-1 text-[color:var(--color-ok)] hover:bg-[color:var(--color-ok-bg)] disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Cancel"
        onClick={() => {
          setValue("");
          setEditing(false);
        }}
        className="rounded p-1 text-[color:var(--color-ink-3)] hover:bg-[color:var(--color-surface-2)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
