"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/app/Toast";
import { updateMyProfileAction } from "../actions";

export function ProfileForm({ name: initialName, phone: initialPhone }: { name: string; phone: string }) {
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [phone, setPhone] = React.useState(initialPhone);
  const [pending, setPending] = React.useState(false);
  const changed = name.trim() !== initialName || phone.trim() !== initialPhone;

  async function save() {
    setPending(true);
    try {
      const r = await updateMyProfileAction({ name, phone });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success("Profile saved.");
      setPhone(r.data.phone);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">Name</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-[color:var(--color-ink-3)]">Mobile</span>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" placeholder="98765 43210" />
      </label>
      <Button type="submit" gold disabled={pending || !changed || !name.trim()} className="w-full">
        {pending ? "…" : "Save profile"}
      </Button>
    </form>
  );
}
