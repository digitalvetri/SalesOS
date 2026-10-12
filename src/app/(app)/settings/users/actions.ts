"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { normalizePhone, PhoneParseError } from "@/server/domain/phone";
import { AppError } from "@/lib/errors";
import {
  adminCreateUser,
  adminUpdateUser,
  adminUpdateUserEmail,
  adminDeactivateUser,
  adminResetPassword,
  adminSetPassword,
  generateTempPassword,
} from "@/server/services/userService";

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

const RoleSchema = z.enum(["OWNER", "ADMIN", "ACCOUNTS", "SALES", "DISPATCH"]);

const CreateInput = z.object({
  name: z.string().min(1).max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: PhoneSchema,
  role: RoleSchema,
  defaultEntityId: z.string().optional().nullable(),
  canReceivePayments: z.boolean().optional(),
});

export const createUserAction = makeServerAction({
  input: CreateInput,
  action: "users.manage",
  revalidate: "/settings/users",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    if (parsed.role === "OWNER" && session.role !== "OWNER") {
      throw new AppError("FORBIDDEN", "Only an Owner can create another Owner.");
    }
    const password = generateTempPassword();
    const user = await adminCreateUser({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      name: parsed.name,
      email: parsed.email,
      phoneE164: parsed.phone,
      password,
      role: parsed.role,
      defaultEntityId: parsed.defaultEntityId ?? null,
      canReceivePayments: parsed.canReceivePayments,
    });
    return { userId: user.id, tempPassword: password };
  },
});

const UpdateInput = z.object({
  userId: z.string(),
  name: z.string().min(1).max(80).optional(),
  role: RoleSchema.optional(),
  defaultEntityId: z.string().optional().nullable(),
  canReceivePayments: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const updateUserAction = makeServerAction({
  input: UpdateInput,
  action: "users.manage",
  revalidate: "/settings/users",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const { userId, ...rest } = parsed;
    const u = await adminUpdateUser({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      userId,
      ...rest,
    });
    return { userId: u.id };
  },
});

const DeactivateInput = z.object({ userId: z.string() });

export const deactivateUserAction = makeServerAction({
  input: DeactivateInput,
  action: "users.manage",
  revalidate: "/settings/users",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    if (parsed.userId === session.userId) {
      throw new AppError("VALIDATION", "You cannot deactivate your own account.");
    }
    const u = await adminDeactivateUser({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      userId: parsed.userId,
    });
    return { userId: u.id, active: u.active };
  },
});

const UpdateEmailInput = z.object({
  userId: z.string(),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});

export const updateUserEmailAction = makeServerAction({
  input: UpdateEmailInput,
  action: "users.manage",
  revalidate: "/employees",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const u = await adminUpdateUserEmail({
      tenantId: session.tenantId,
      actorId: session.userId,
      userId: parsed.userId,
      email: parsed.email,
    });
    return { userId: u.id, email: u.email };
  },
});

const SetPasswordInput = z.object({
  userId: z.string(),
  password: z.string().min(8, "Password must be at least 8 characters.").max(100),
});

export const setPasswordAction = makeServerAction({
  input: SetPasswordInput,
  action: "users.manage",
  revalidate: "/employees",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    await adminSetPassword({
      tenantId: session.tenantId,
      actorId: session.userId,
      userId: parsed.userId,
      newPassword: parsed.password,
    });
    return { userId: parsed.userId };
  },
});

const ResetInput = z.object({ userId: z.string() });

export const resetPasswordAction = makeServerAction({
  input: ResetInput,
  action: "users.manage",
  revalidate: "/settings/users",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const newPassword = generateTempPassword();
    await adminResetPassword({
      tenantId: session.tenantId,
      actorId: session.userId,
      userId: parsed.userId,
      newPassword,
    });
    return { userId: parsed.userId, tempPassword: newPassword };
  },
});
