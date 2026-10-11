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
    <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — navy with gold wordmark. Hidden on mobile; the form sits
          on the cream background and a navy badge replaces the panel there. */}
      <aside className="relative hidden flex-col justify-between bg-[color:var(--color-nav-bg)] px-10 py-10 text-[color:var(--color-nav-ink)] md:flex">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-[color:var(--color-nav-accent)] text-sm font-bold text-[color:var(--color-nav-bg)]">
            S
          </span>
          <span className="text-xl font-semibold tracking-tight text-[color:var(--color-nav-accent)]">
            {BRAND.name}
          </span>
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl font-semibold leading-tight text-[color:var(--color-nav-ink)]">
            Manage your sales,
            <br />
            <span className="text-[color:var(--color-nav-accent)]">effortlessly.</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-[color:var(--color-nav-ink-2)]">
            {BRAND.tagline} — one view across KI &amp; KFM, from the first
            enquiry to the balance clear.
          </p>
        </div>

        <p className="text-xs text-[color:var(--color-nav-ink-3)]">
          © {new Date().getFullYear()} {BRAND.name}
        </p>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center bg-[color:var(--color-bg)] px-4 py-10">
        <div className="w-full max-w-sm">
          {/* Mobile-only brand chip, replaces the navy panel on small screens */}
          <div className="mb-8 flex items-center gap-2 md:hidden">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--color-nav-bg)] text-sm font-bold text-[color:var(--color-nav-accent)]">
              S
            </span>
            <span className="text-lg font-semibold tracking-tight text-[color:var(--color-ink)]">
              {BRAND.name}
            </span>
          </div>

          <header className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-[color:var(--color-ink)]">
              Welcome back
            </h1>
            <p className="mt-1 text-sm text-[color:var(--color-ink-3)]">
              {t("brand.entities")}
            </p>
          </header>

          <LoginForm />
        </div>
      </main>
    </div>
  );
}
