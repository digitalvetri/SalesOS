"use client";
import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/app/Toast";
import { changeMyPasswordAction } from "../actions";

export function ChangeMyPassword() {
  const [p1, setP1] = React.useState("");
  const [p2, setP2] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function save() {
    if (pending) return;
    if (p1.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (p1 !== p2) {
      toast.error("Passwords don't match.");
      return;
    }
    setPending(true);
    try {
      const r = await changeMyPasswordAction({ newPassword: p1 });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success("Password changed.");
      setP1("");
      setP2("");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="relative">
        <Input
          type={show ? "text" : "password"}
          value={p1}
          onChange={(e) => setP1(e.target.value)}
          placeholder="New password"
          autoComplete="new-password"
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-[color:var(--color-ink-3)]"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <Input
        type={show ? "text" : "password"}
        value={p2}
        onChange={(e) => setP2(e.target.value)}
        placeholder="Confirm new password"
        autoComplete="new-password"
      />
      <Button type="submit" disabled={pending || !p1 || !p2} className="w-full">
        {pending ? "…" : "Change password"}
      </Button>
      <p className="text-[11px] text-[color:var(--color-ink-3)]">
        Supabase requires 8+ characters. Your current sessions on other devices
        stay active until they expire.
      </p>
    </form>
  );
}
