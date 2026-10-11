"use client";
import * as React from "react";
import { useTranslations } from "next-intl";
import { deactivateUserAction, updateUserAction, resetPasswordAction } from "../actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/app/Toast";
import { TempPasswordDialog } from "./TempPasswordDialog";
import type { UserListRow } from "@/server/repo/users";

export function UserRow({ user, isSelf }: { user: UserListRow; isSelf: boolean }) {
  const t = useTranslations("settings.users");
  const [pending, setPending] = React.useState(false);
  const [tempPassword, setTempPassword] = React.useState<string | null>(null);

  async function toggleActive() {
    if (isSelf && user.active) {
      toast.error(t("cannotDeactivateSelf"));
      return;
    }
    setPending(true);
    try {
      if (user.active) {
        const r = await deactivateUserAction({ userId: user.id });
        if (!r.ok) toast.error(r.error.message);
      } else {
        const r = await updateUserAction({ userId: user.id, active: true });
        if (!r.ok) toast.error(r.error.message);
      }
    } finally {
      setPending(false);
    }
  }

  async function reset() {
    setPending(true);
    try {
      const r = await resetPasswordAction({ userId: user.id });
      if (!r.ok) {
        toast.error(r.error.message);
      } else {
        setTempPassword(r.data.tempPassword);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="inline-flex gap-2">
      <Button size="sm" variant="outline" onClick={reset} disabled={pending}>
        {t("resetPassword")}
      </Button>
      <Button
        size="sm"
        variant={user.active ? "danger" : "default"}
        onClick={toggleActive}
        disabled={pending || (isSelf && user.active)}
      >
        {user.active ? t("deactivate") : t("activate")}
      </Button>
      <TempPasswordDialog
        open={tempPassword !== null}
        password={tempPassword ?? ""}
        phone={user.phoneE164}
        name={user.name}
        onClose={() => setTempPassword(null)}
      />
    </div>
  );
}
