"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { editUserAction, setPasswordAction } from "../actions";
import type { Role } from "@/server/repo/client";

type EntityOpt = { id: string; code: string; name: string };
type EditableUser = {
  id: string; name: string; email: string; phone: string; role: Role;
  defaultEntityId: string | null; canReceivePayments: boolean;
};

const ROLES: Role[] = ["ADMIN", "ACCOUNTS", "SALES", "DISPATCH"];
const selectCls =
  "h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base disabled:opacity-60";

export function EditUserForm({
  user, entities, canSetOwner, locked, isSelf,
}: { user: EditableUser; entities: EntityOpt[]; canSetOwner: boolean; locked: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [name, setName] = React.useState(user.name);
  const [email, setEmail] = React.useState(user.email);
  const [phone, setPhone] = React.useState(user.phone);
  const [role, setRole] = React.useState<Role>(user.role);
  const [entityId, setEntityId] = React.useState(user.defaultEntityId ?? "");
  const [canReceive, setCanReceive] = React.useState(user.canReceivePayments);
  const roles = canSetOwner || user.role === "OWNER" ? (["OWNER", ...ROLES] as Role[]) : ROLES;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const r = await editUserAction({
        userId: user.id, name, email, phone, role, defaultEntityId: entityId || null, canReceivePayments: canReceive,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`${name} saved.`);
      router.push("/settings/users");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-8">
      <form onSubmit={save} className="space-y-5">
        <fieldset disabled={locked} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Login email</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={254} />
            <p className="text-xs text-[color:var(--color-ink-3)]">They sign in with this. Must be unique.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Mobile</Label>
            <div className="flex overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)]">
              <span className="flex items-center justify-center bg-[color:var(--color-surface-2)] px-3 text-sm text-[color:var(--color-ink-2)]">+91</span>
              <input
                id="phone" type="tel" inputMode="numeric" required
                className="flex-1 border-0 bg-transparent px-3 text-base focus-visible:outline-none"
                value={phone} onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <select id="role" value={role} onChange={(e) => setRole(e.target.value as Role)} className={selectCls} disabled={locked || isSelf}>
                {roles.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              {isSelf && <p className="text-xs text-[color:var(--color-ink-3)]">You can&apos;t change your own role.</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="entity">Bills from</Label>
              <select id="entity" value={entityId} onChange={(e) => setEntityId(e.target.value)} className={selectCls}>
                <option value="">—</option>
                {entities.map((ent) => <option key={ent.id} value={ent.id}>{ent.code} · {ent.name}</option>)}
              </select>
            </div>
          </div>
          <label className="flex items-start gap-3 rounded-[var(--radius)] border border-[color:var(--color-border)] p-3">
            <input type="checkbox" className="mt-1 h-4 w-4" checked={canReceive} onChange={(e) => setCanReceive(e.target.checked)} />
            <span className="text-sm font-medium">Can receive payments</span>
          </label>
        </fieldset>
        {locked ? (
          <p className="text-sm text-[color:var(--color-warn)]">Only an Owner can edit an Owner.</p>
        ) : (
          <Button type="submit" gold disabled={pending || !name.trim() || !email.trim() || !phone.trim()} className="h-11 w-full">
            {pending ? "…" : "Save changes"}
          </Button>
        )}
      </form>

      {!locked && <SetPassword userId={user.id} name={user.name} />}
    </div>
  );
}

function SetPassword({ userId, name }: { userId: string; name: string }) {
  const [pw, setPw] = React.useState("");
  const [show, setShow] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (pw.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    setPending(true);
    try {
      const r = await setPasswordAction({ userId, password: pw });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      toast.success(`New password set for ${name}. Their other sign-ins were ended.`);
      setPw("");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3 rounded-[var(--radius-lg)] border border-[color:var(--color-border)] bg-[color:var(--color-surface)] p-4">
      <div>
        <h3 className="text-sm font-semibold">Set a new password</h3>
        <p className="text-xs text-[color:var(--color-ink-3)]">Type the password you&apos;ll give {name} (at least 8 characters).</p>
      </div>
      <div className="relative">
        <Input type={show ? "text" : "password"} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" className="pr-10" placeholder="New password" />
        <button
          type="button" onClick={() => setShow((v) => !v)} aria-label={show ? "Hide password" : "Show password"}
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-[color:var(--color-ink-3)]"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <Button type="submit" variant="outline" disabled={pending || !pw} className="w-full">
        {pending ? "…" : "Set password"}
      </Button>
    </form>
  );
}
