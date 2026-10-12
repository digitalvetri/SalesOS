// v1.1 §1.1 — Payments screens are removed (payments live inside each order);
// every /payments/* URL redirects.
import { redirectToOverview } from "../_shells/removedRoute";

export default async function PaymentsLayout() {
  return redirectToOverview();
}
