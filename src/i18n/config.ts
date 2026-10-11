// Server-only next-intl config. English is the only UI language.
import "server-only";
import { getRequestConfig } from "next-intl/server";
import { LOCALE } from "./locale";
import messages from "./messages/en.json";

export default getRequestConfig(async () => ({ locale: LOCALE, messages }));
