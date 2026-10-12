// v1.1 §1.1 — Customers screens are removed; every /customers/* URL redirects.
import { redirectToOverview } from "../_shells/removedRoute";

export default async function CustomersLayout() {
  return redirectToOverview();
}
