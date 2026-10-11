// Server-only next-intl config. Reads the locale cookie on the server.
import "server-only";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "./locale";

export async function readLocale(): Promise<Locale> {
  const store = await cookies();
  const value = store.get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export default getRequestConfig(async () => {
  const locale = await readLocale();
  const messages = (await import(`./messages/${locale}.json`)).default;
  return { locale, messages };
});
