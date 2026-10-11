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
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPw, setShowPw] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const result = await signInAction({ email, password });
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
          <Label htmlFor="email">{t("login.emailLabel")}</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="you@salesos.in"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
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

        <Button type="submit" gold className="h-12 w-full" disabled={pending || !email || !password}>
          {pending ? t("common.loading") : t("login.submit")}
        </Button>

        <p className="text-center text-xs text-[color:var(--color-ink-3)]">{t("login.forgot")}</p>
      </div>
    </form>
  );
}
