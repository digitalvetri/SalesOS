import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { LOCALE } from "@/i18n/locale";
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
  const messages = await getMessages();
  // Dark theme is an explicit opt-in (§10.1, Owner/Admin profile toggle).
  const dark = (await cookies()).get(THEME_COOKIE)?.value === "dark";

  return (
    <html lang={LOCALE} className={inter.variable} {...(dark ? { "data-theme": "dark" } : {})}>
      <body>
        <NextIntlClientProvider locale={LOCALE} messages={messages}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
        {process.env.NODE_ENV !== "production" && <GoldAudit />}
      </body>
    </html>
  );
}
