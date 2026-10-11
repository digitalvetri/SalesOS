"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { normalizePhone, PhoneParseError } from "@/server/domain/phone";
import {
  upsertCustomerByPhone,
  updateCustomer,
  mergeCustomers,
} from "@/server/services/customerService";

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

const CreateInput = z.object({
  phone: PhoneSchema,
  name: z.string().min(1).max(120),
  businessName: z.string().max(120).nullable().optional(),
  altPhone: PhoneSchema.optional(),
  type: z.enum(["END_CUSTOMER", "DEALER", "INSTITUTION"]).optional(),
  city: z.string().max(80).nullable().optional(),
  state: z.string().max(80).nullable().optional(),
  gstin: z.string().max(15).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const createCustomerAction = makeServerAction({
  input: CreateInput,
  action: "customers.manage",
  resolveOwnership: () => ({ isOwn: true }), // SALES can create their own customers
  revalidate: "/customers",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const { customer, created } = await upsertCustomerByPhone({
      tenantId: session.tenantId,
      actorId: session.userId,
      phoneE164: parsed.phone,
      name: parsed.name,
      businessName: parsed.businessName ?? null,
      altPhone: parsed.altPhone ?? null,
      type: parsed.type,
      city: parsed.city ?? null,
      state: parsed.state ?? null,
      gstin: parsed.gstin ?? null,
      address: parsed.address ?? null,
      notes: parsed.notes ?? null,
      ownerUserId: session.role === "SALES" ? session.userId : null,
    });
    return { id: customer.id, created };
  },
});

const UpdateInput = z.object({
  id: z.string(),
  name: z.string().min(1).max(120).optional(),
  businessName: z.string().max(120).nullable().optional(),
  altPhone: PhoneSchema.optional(),
  type: z.enum(["END_CUSTOMER", "DEALER", "INSTITUTION"]).optional(),
  city: z.string().max(80).nullable().optional(),
  state: z.string().max(80).nullable().optional(),
  gstin: z.string().max(15).nullable().optional(),
  address: z.string().max(400).nullable().optional(),
  notes: z.string().max(1000).nullable().optional(),
});

export const updateCustomerAction = makeServerAction({
  input: UpdateInput,
  action: "customers.manage",
  resolveOwnership: () => ({ isOwn: true }),
  revalidate: "/customers",
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await updateCustomer({
      tenantId: session.tenantId,
      actorId: session.userId,
      id: parsed.id,
      name: parsed.name,
      businessName: parsed.businessName,
      altPhone: parsed.altPhone,
      type: parsed.type,
      city: parsed.city,
      state: parsed.state,
      gstin: parsed.gstin,
      address: parsed.address,
      notes: parsed.notes,
    });
    return { id: row.id };
  },
});

const MergeInput = z.object({
  sourceId: z.string(),
  survivorId: z.string(),
});

export const mergeCustomersAction = makeServerAction({
  input: MergeInput,
  action: "customers.manage",
  revalidate: ["/customers"],
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    // Merge is Admin/Owner only; SALES role is denied by the matrix. The guard here is
    // belt-and-braces because the "customers.manage" permission allows SALES as "own".
    if (session.role !== "ADMIN" && session.role !== "OWNER") {
      throw new AppError("FORBIDDEN", "Only Owner or Admin can merge customers.");
    }
    const result = await mergeCustomers({
      tenantId: session.tenantId,
      actorId: session.userId,
      sourceId: parsed.sourceId,
      survivorId: parsed.survivorId,
    });
    return result;
  },
});
