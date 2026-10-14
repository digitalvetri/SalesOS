"use server";
import { z } from "zod";
import { makeServerAction } from "@/lib/serverAction";
import { AppError } from "@/lib/errors";
import { setProductionStatusV2 } from "@/server/services/orderV2Service";

export const setProductionStatusAction = makeServerAction({
  input: z.object({ orderId: z.string(), status: z.enum(["NOT_STARTED", "IN_PROGRESS", "FINISHED"]) }),
  action: "production.update",
  revalidate: ["/production", "/orders", "/dashboard", "/home"],
  async run(parsed, session) {
    if (!session) throw new AppError("UNAUTHENTICATED", "Sign in required.");
    const row = await setProductionStatusV2({
      tenantId: session.tenantId,
      actorId: session.userId,
      actorRole: session.role,
      orderId: parsed.orderId,
      status: parsed.status,
    });
    return { orderId: row.id, productionStatus: row.productionStatus };
  },
});
