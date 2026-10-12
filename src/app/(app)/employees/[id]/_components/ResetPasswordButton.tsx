"use client";
import * as React from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/app/Toast";
import { resetPasswordAction } from "@/app/(app)/settings/users/actions";
import { TempPasswordDialog } from "@/app/(app)/settings/users/_components/TempPasswordDialog";

export function ResetPasswordButton({ userId, name, phone }: { userId: string; name: string; phone: string }) {
  const [pending, setPending] = React.useState(false);
  const [temp, setTemp] = React.useState<string | null>(null);

  async function reset() {
    if (pending) return;
    setPending(true);
    try {
      const r = await resetPasswordAction({ userId });
      if (!r.ok) {
        toast.error(r.error.message);
        return;
      }
      setTemp(r.data.tempPassword);
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button variant="outline" onClick={reset} disabled={pending} className="inline-flex items-center gap-2">
        <KeyRound className="h-4 w-4" /> Reset password
      </Button>
      <TempPasswordDialog
        open={temp !== null}
        password={temp ?? ""}
        phone={phone}
        name={name}
        onClose={() => setTemp(null)}
      />
    </>
  );
}
