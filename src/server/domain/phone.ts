// Phone normalisation (spec BR-06). 100% test coverage required.
// Pure functions — zero framework imports.

export type NormalizedPhone = { e164: string; display: string };

export class PhoneParseError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`PhoneParseError: ${reason}`);
    this.name = "PhoneParseError";
    this.reason = reason;
  }
}

const DIGITS = /[^\d+]/g;

export function normalizePhone(raw: string): NormalizedPhone {
  const input = (raw ?? "").trim();
  if (!input) throw new PhoneParseError("empty");

  // Strip spaces, dashes, parentheses — keep leading '+' only.
  const cleaned = input.replace(DIGITS, "");

  // Already E.164 international (e.g. +14155551234)
  if (cleaned.startsWith("+") && cleaned.length > 1) {
    const digits = cleaned.slice(1);
    if (!/^\d+$/.test(digits)) throw new PhoneParseError("non-digit after plus");
    // Treat +91 as Indian — validate 10-digit subscriber part.
    if (digits.startsWith("91") && digits.length === 12) {
      return indianE164(digits.slice(2));
    }
    if (digits.length < 8 || digits.length > 15) {
      throw new PhoneParseError("international length");
    }
    return { e164: cleaned, display: cleaned };
  }

  // Pure digits — Indian conventions:
  // - 10 digits: subscriber
  // - 11 digits starting '0': strip trunk '0'
  // - 12 digits starting '91': strip country code
  let subscriber = cleaned;
  if (/^0\d{10}$/.test(subscriber)) subscriber = subscriber.slice(1);
  else if (/^91\d{10}$/.test(subscriber)) subscriber = subscriber.slice(2);

  if (/^\d{10}$/.test(subscriber)) {
    return indianE164(subscriber);
  }

  throw new PhoneParseError("not 10 digits or recognised format");
}

function indianE164(subscriber: string): NormalizedPhone {
  if (!/^[6-9]\d{9}$/.test(subscriber)) {
    throw new PhoneParseError("indian subscriber must start 6-9");
  }
  const e164 = `+91${subscriber}`;
  const display = `+91 ${subscriber.slice(0, 5)} ${subscriber.slice(5)}`;
  return { e164, display };
}

export function tryNormalizePhone(raw: string): NormalizedPhone | null {
  try {
    return normalizePhone(raw);
  } catch {
    return null;
  }
}
