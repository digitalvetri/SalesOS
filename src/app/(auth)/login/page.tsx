import { redirect } from "next/navigation";
import { getSession } from "@/server/auth/session";
import { LoginForm } from "./LoginForm";
import { BRAND } from "@/config/brand";
import { getTranslations } from "next-intl/server";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/home");

  const t = await getTranslations();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[color:var(--color-bg)] px-4 py-8">
      <div className="w-full max-w-sm">
        <header className="mb-10">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--color-ink)]">
              {BRAND.name}
            </h1>
            <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">{t("brand.entities")}</p>
          </div>
        </header>
        <LoginForm />
      </div>
    </div>
  );
}
