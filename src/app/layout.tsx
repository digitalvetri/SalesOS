import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { LOCALE } from "@/i18n/locale";
import { BRAND } from "@/config/brand";
import { Toaster } from "@/components/app/Toast";
import { GoldAudit } from "@/components/app/GoldAudit";
import { cookies } from "next/headers";
import { THEME_COOKIE } from "@/config/theme";
import "./globals.css";

const sans = Poppins({
  subsets: ["latin"],
  variable: "--font-sans-brand",
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: BRAND.name,
  description: BRAND.tagline,
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0C3B37",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const messages = await getMessages();
  // Light is the default theme; dark is an opt-in from the profile menu.
  const dark = (await cookies()).get(THEME_COOKIE)?.value === "dark";

  return (
    <html lang={LOCALE} className={sans.variable} {...(dark ? { "data-theme": "dark" } : {})}>
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
