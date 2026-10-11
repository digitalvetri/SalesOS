import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Tamil } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { readLocale } from "@/i18n/config";
import { BRAND } from "@/config/brand";
import { Toaster } from "@/components/app/Toast";
import { GoldAudit } from "@/components/app/GoldAudit";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/config/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoTamil = Noto_Sans_Tamil({
  subsets: ["tamil"],
  variable: "--font-noto-tamil",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#F7F6F2",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await readLocale();
  const messages = await getMessages();
  // Dark theme is an explicit opt-in (§10.1, Owner/Admin profile toggle).
  const dark = (await cookies()).get(THEME_COOKIE)?.value === "dark";

  return (
    <html lang={locale} className={`${inter.variable} ${notoTamil.variable}`} {...(dark ? { "data-theme": "dark" } : {})}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
        {process.env.NODE_ENV !== "production" && <GoldAudit />}
      </body>
    </html>
  );
}
