// v1.1: the old order-detail screen is removed. Links to /orders/<id> (e.g.
// from notifications) open the Orders sheet filtered to that customer.
import { redirect } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/server/repo/client";

export default async function OrderDetailRedirect({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const order = await prisma.order.findFirst({
    where: { tenantId: session.tenantId, id },
    select: { customer: { select: { phoneE164: true } } },
  });
  const q = order?.customer.phoneE164.replace(/^\+91/, "");
  redirect(q ? `/orders?q=${encodeURIComponent(q)}` : "/orders");
}
