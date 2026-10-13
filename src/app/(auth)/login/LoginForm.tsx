"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Loader2, Lock, Mail, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/app/Toast";
import { signInAction } from "./actions";

export function LoginForm() {
  const t = useTranslations();
  const router = useRouter();
  const [showPw, setShowPw] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    // Read straight from the form: browser autofill fills the inputs without
    // firing React onChange, so component state can be empty when it isn't.
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    if (!email || !password) {
      toast.error(t("login.errors.missingFields"));
      return;
    }
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
    } catch {
      toast.error("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const iconCls =
    "pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[color:var(--color-ink-3)]";

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email">{t("login.emailLabel")}</Label>
          <div className="relative">
            <Mail className={iconCls} aria-hidden />
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="you@gmail.com"
              className="h-12 pl-11"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">{t("login.passwordLabel")}</Label>
          <div className="relative">
            <Lock className={iconCls} aria-hidden />
            <Input
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              required
              placeholder="••••••••"
              className="h-12 pl-11 pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? t("login.hidePassword") : t("login.showPassword")}
              className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-[color:var(--color-ink-3)] transition-colors hover:text-[color:var(--color-ink)]"
            >
              {showPw ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
            </button>
          </div>
        </div>

        <Button type="submit" gold className="group h-12 w-full text-base" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              {t("common.loading")}
            </>
          ) : (
            <>
              {t("login.submit")}
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </>
          )}
        </Button>

        <p className="text-center text-xs text-[color:var(--color-ink-3)]">{t("login.forgot")}</p>
      </div>
    </form>
  );
}
