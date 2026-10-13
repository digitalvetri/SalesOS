"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { normalizePhone, PhoneParseError } from "@/server/domain/phone";
import { AppError } from "@/lib/errors";
import { updateMyProfile } from "@/server/services/userService";

const PhoneSchema = z.string().min(3).transform((raw, ctx) => {
  try {
    return normalizePhone(raw).e164;
  } catch (e) {
    if (e instanceof PhoneParseError) {
      ctx.addIssue({ code: "custom", message: "Enter a valid 10-digit mobile number." });
      return z.NEVER;
    }
    throw e;
  }
});

export const updateMyProfileAction = makeServerAction({
  input: z.object({ name: z.string().trim().min(1, "Enter your name.").max(80), phone: PhoneSchema }),
  action: "profile.self",
  revalidate: "/profile",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const u = await updateMyProfile({ tenantId: session.tenantId, userId: session.userId, name: parsed.name, phoneE164: parsed.phone });
    return { name: u.name, phone: u.phoneE164 };
  },
});
