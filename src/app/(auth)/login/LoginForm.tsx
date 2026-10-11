"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { signInAction } from "./actions";

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const [phone, setPhone] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const result = await signInAction({ phone, password });
      if (result.ok) {
        router.push("/home");
        router.refresh();
        return;
      }
      const code = result.error.code;
      const message =
        code === "INVALID_CREDENTIALS"
          ? t("login.errors.invalidCredentials")
          : code === "DEACTIVATED"
          ? t("login.errors.deactivated")
          : code === "RATE_LIMITED"
          ? t("login.errors.rateLimited")
          : result.error.message;
      toast.error(message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="phone">{t("login.phoneLabel")}</Label>
          <div className="flex overflow-hidden rounded-[var(--radius)] border border-[color:var(--color-border-strong)] bg-[color:var(--color-surface)] focus-within:ring-2 focus-within:ring-[color:var(--color-ink)]/60">
            <span className="flex items-center justify-center bg-[color:var(--color-surface-2)] px-3 text-sm text-[color:var(--color-ink-2)]">
              +91
            </span>
            <input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel-national"
              required
              className="flex-1 border-0 bg-transparent px-3 text-base text-[color:var(--color-ink)] placeholder:text-[color:var(--color-ink-3)] focus-visible:outline-none"
              placeholder="98437 22055"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("login.passwordLabel")}</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? t("login.hidePassword") : t("login.showPassword")}
              className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[color:var(--color-ink-3)]"
            >
              {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <Button type="submit" gold className="h-12 w-full" disabled={pending || !phone || !password}>
          {pending ? t("common.loading") : t("login.submit")}
        </Button>

        <p className="text-center text-xs text-[color:var(--color-ink-3)]">{t("login.forgot")}</p>
      </div>
    </form>
  );
}
