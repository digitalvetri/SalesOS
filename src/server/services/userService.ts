// Admin-only user management via Supabase service-role client.
// Called by Server Actions in later phases (Settings → Users).
import { supabaseService } from "@/lib/supabase/service";
import { prisma, type Role, type Lang } from "@/server/repo/client";
import { AppError } from "@/lib/errors";

export type AdminCreateUserInput = {
  tenantId: string;
  phoneE164: string;
  password: string;
  name: string;
  role: Role;
  lang?: Lang;
  defaultEntityId?: string | null;
  canReceivePayments?: boolean;
};

export async function adminCreateUser(input: AdminCreateUserInput) {
  const existing = await prisma.user.findUnique({
    where: { tenantId_phoneE164: { tenantId: input.tenantId, phoneE164: input.phoneE164 } },
  });
  if (existing) {
    throw new AppError("CONFLICT", "A user with this mobile number already exists.");
  }

  const sb = supabaseService();
  // SalesOS presents mobile+password in the UI (spec D4) but Auth stores the user
  // under a synthetic email `<digits>@phone.salesos.local`. See src/server/auth/phoneToEmail.ts.
  const emailForAuth = `${input.phoneE164.replace(/^\+/, "")}@phone.salesos.local`;
  const { data, error } = await sb.auth.admin.createUser({
    email: emailForAuth,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      name: input.name,
      role: input.role,
      tenantId: input.tenantId,
      phoneE164: input.phoneE164,
    },
  });
  if (error || !data.user) {
    throw new AppError("INTERNAL", "Could not create auth user.", { supabase: error?.message });
  }

  const user = await prisma.user.create({
    data: {
      tenantId: input.tenantId,
      authUserId: data.user.id,
      name: input.name,
      phoneE164: input.phoneE164,
      role: input.role,
      lang: input.lang ?? "en",
      defaultEntityId: input.defaultEntityId ?? null,
      canReceivePayments: input.canReceivePayments ?? false,
    },
  });
  return user;
}

export async function adminDeactivateUser(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { active: false } });
}

export async function adminResetPassword(userId: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("NOT_FOUND", "User not found.");
  const sb = supabaseService();
  const { error } = await sb.auth.admin.updateUserById(user.authUserId, { password: newPassword });
  if (error) throw new AppError("INTERNAL", "Could not reset password.", { supabase: error.message });
}
