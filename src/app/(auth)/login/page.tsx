import { redirect } from "next/navigation";
import { BarChart3, Check, IndianRupee, TrendingUp } from "lucide-react";
import { LogoMark } from "@/components/app/Logo";
import { getSession } from "@/server/auth/session";
import { LoginForm } from "./LoginForm";
import { Parallax } from "./Parallax";
import { BRAND } from "@/config/brand";
import { getTranslations } from "next-intl/server";
import s from "./login.module.css";

// [left %, top %, delay s] — fixed positions so server and client render the same.
const STARS: [number, number, number][] = [
  [12, 18, 0], [28, 72, 1.2], [44, 32, 0.4], [63, 12, 2.1], [78, 58, 0.8],
  [88, 26, 1.6], [8, 88, 2.6], [92, 84, 0.2], [52, 90, 1.9], [35, 8, 3],
];

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/home");

  const t = await getTranslations();

  return (
    <Parallax className={s.theme}>
      {/* Background: twinkling dots + moving perspective grid. */}
      <div className={s.stars} aria-hidden>
        {STARS.map(([x, y, d], i) => (
          <span key={i} className={s.star} style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${d}s` }} />
        ))}
      </div>
      <div className={s.floor} aria-hidden />

      <div className={s.layout}>
        {/* Brand + 3D scene. On phones it sits above the card, smaller. */}
        <section className="flex flex-col gap-4 lg:gap-6">
          <div className="flex items-center gap-2.5">
            <LogoMark size={40} />
            <span className={s.wordmark}>{BRAND.name}</span>
          </div>

          <div className={s.stage} aria-hidden>
            <div className={s.rig}>
              <div className={s.cubeAnchor}>
                <span className={`${s.ring} ${s.ring1}`} />
                <span className={`${s.ring} ${s.ring2}`} />
                <div className={s.cube}>
                  <div className={`${s.face} ${s.front}`}><BarChart3 /></div>
                  <div className={`${s.face} ${s.back}`}><IndianRupee /></div>
                  <div className={`${s.face} ${s.right}`}><Check /></div>
                  <div className={`${s.face} ${s.left}`}><TrendingUp /></div>
                  <div className={`${s.face} ${s.top}`} />
                  <div className={`${s.face} ${s.bottom}`} />
                </div>
              </div>

              <div className={`${s.float} ${s.floatA}`}>
                <div className={s.floatLabel}>Payment received</div>
                <div className={s.floatValue}>₹13.0L</div>
                <div className={s.up}>▲ 81% this month</div>
              </div>
              <div className={`${s.float} ${s.floatB}`}>
                <div className={s.floatLabel}>Monthly sales</div>
                <div className={s.bars}>
                  {[0.55, 0.8, 0.45, 0.95, 0.7, 1].map((h, i) => (
                    <span
                      key={i}
                      className={s.bar}
                      style={{ height: `${h * 100}%`, animationDelay: `${i * 0.25}s` }}
                    />
                  ))}
                </div>
              </div>
              <div className={`${s.float} ${s.floatC}`}>
                <div className="flex items-center gap-2.5">
                  <span className={s.check}>
                    <Check className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">Order #32 saved</div>
                    <div className={s.floatLabel}>just now</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="hidden max-w-lg lg:block">
            <h2 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">
              Manage your sales,
              <br />
              <span className={s.accentText}>effortlessly.</span>
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-[color:var(--color-ink-2)]">
              {BRAND.tagline} — one view across KI &amp; KFM, from the first enquiry to the
              balance clear.
            </p>
          </div>
        </section>

        {/* Login card */}
        <div className={s.cardWrap}>
          <div className={s.card}>
            <header className="mb-7">
              <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">
                Welcome <span className={s.accentText}>back</span>
              </h1>
              <p className="mt-1.5 text-sm text-[color:var(--color-ink-3)]">
                Sign in to {BRAND.name} · {t("brand.entities")}
              </p>
            </header>

            <LoginForm />
          </div>
          <p className={`${s.copy} mt-6 text-center`}>
            © {new Date().getFullYear()} {BRAND.name}
          </p>
        </div>
      </div>
    </Parallax>
  );
}
