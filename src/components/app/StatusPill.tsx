"use client";
import * as React from "react";
import { Badge } from "@/components/ui/badge";

// All statuses visible across the app. Colour map per §10.5.
export type AnyStatus =
  | "PENDING_APPROVAL"
  | "CONFIRMED"
  | "IN_PRODUCTION"
  | "READY"
  | "PARTIALLY_DISPATCHED"
  | "DISPATCHED"
  | "DELIVERED"
  | "CLOSED"
  | "CANCELLED"
  | "PENDING_VERIFICATION"
  | "VERIFIED"
  | "REJECTED";

const TONE: Record<AnyStatus, React.ComponentProps<typeof Badge>["tone"]> = {
  PENDING_APPROVAL: "warn",
  CONFIRMED: "info",
  IN_PRODUCTION: "info",
  READY: "ok",
  PARTIALLY_DISPATCHED: "info",
  DISPATCHED: "info",
  DELIVERED: "ok",
  CLOSED: "neutral",
  CANCELLED: "danger",
  PENDING_VERIFICATION: "warn",
  VERIFIED: "ok",
  REJECTED: "danger",
};

const LABEL: Record<AnyStatus, string> = {
  PENDING_APPROVAL: "Pending approval",
  CONFIRMED: "Confirmed",
  IN_PRODUCTION: "In production",
  READY: "Ready",
  PARTIALLY_DISPATCHED: "Partially dispatched",
  DISPATCHED: "Dispatched",
  DELIVERED: "Delivered",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  PENDING_VERIFICATION: "Pending verification",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

export function StatusPill({ status }: { status: AnyStatus }) {
  return <Badge tone={TONE[status]}>{LABEL[status]}</Badge>;
}
