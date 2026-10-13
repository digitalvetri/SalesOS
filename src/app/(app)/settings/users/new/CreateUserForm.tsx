"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { createUserAction } from "../actions";
import { TempPasswordDialog } from "../_components/TempPasswordDialog";
import type { Role } from "@/server/repo/client";

type EntityOpt = { id: string; code: string; name: string };

const ROLES: Role[] = ["ADMIN", "ACCOUNTS", "SALES", "DISPATCH"];
const OWNER_ONLY: Role[] = ["OWNER"];

export function CreateUserForm({
  canCreateOwner,
  entities,
}: {
  canCreateOwner: boolean;
  entities: EntityOpt[];
}) {
  const t = useTranslations("settings.users");
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [role, setRole] = React.useState<Role>("SALES");
  const [defaultEntityId, setDefaultEntityId] = React.useState<string>(entities[0]?.id ?? "");
  const [canReceive, setCanReceive] = React.useState(true);
  const [tempPassword, setTempPassword] = React.useState<string | null>(null);
  const [createdName, setCreatedName] = React.useState("");
  const [createdPhone, setCreatedPhone] = React.useState("");

  const availableRoles = canCreateOwner ? [...OWNER_ONLY, ...ROLES] : ROLES;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const r = await createUserAction({
        name,
        email,
        phone,
        role,
        defaultEntityId: defaultEntityId || null,
        canReceivePayments: canReceive,
      });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setCreatedName(name);
      setCreatedPhone(phone);
      setTempPassword(r.data.tempPassword);
    } finally {
      setPending(false);
    }
  }

  function closeDialog() {
    setTempPassword(null);
    router.push("/settings/users");
    router.refresh();
  }

  return (
    <>
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name">{t("fieldName")}</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={80}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            maxLength={254}
            placeholder="name@gmail.com"
          />
          <p className="text-xs text-[color:var(--color-ink-3)]">
            Used to sign in. Must be unique.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">{t("fieldPhone")}</Label>
          <div className="flex overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)]">
            <span className="flex items-center justify-center bg-[color:var(--color-surface-2)] px-3 text-sm text-[color:var(--color-ink-2)]">
              +91
            </span>
            <input
              id="phone"
              type="tel"
              inputMode="numeric"
              className="flex-1 border-0 bg-transparent px-3 text-base focus-visible:outline-none"
              placeholder="98437 22055"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="role">{t("fieldRole")}</Label>
          <select
            id="role"
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
          >
            {availableRoles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="entity">{t("fieldDefaultEntity")}</Label>
          <select
            id="entity"
            value={defaultEntityId}
            onChange={(e) => setDefaultEntityId(e.target.value)}
            className="h-11 w-full rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] px-3 text-base"
          >
            <option value="">—</option>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>
                {ent.code} · {ent.name}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-start gap-3 rounded-[var(--radius)] border border-[color:var(--color-border)] p-3">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4"
            checked={canReceive}
            onChange={(e) => setCanReceive(e.target.checked)}
          />
          <span className="text-sm">
            <span className="font-medium">{t("fieldCanReceivePayments")}</span>
            <br />
            <span className="text-[color:var(--color-ink-3)]">{t("canReceiveHint")}</span>
          </span>
        </label>

        <Button
          type="submit"
          gold
          disabled={pending || !name || !email || !phone}
          className="h-11 w-full"
        >
          {pending ? "…" : t("newUser")}
        </Button>
      </form>

      <TempPasswordDialog
        open={tempPassword !== null}
        password={tempPassword ?? ""}
        phone={createdPhone}
        name={createdName}
        onClose={closeDialog}
      />
    </>
  );
}
