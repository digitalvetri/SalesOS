// v1.1: the old multi-step wizard is replaced by the "New order" form on the
// Orders page — /orders?new=1 opens it.
import { redirect } from "next/navigation";

export default function NewOrderRedirect() {
  redirect("/orders?new=1");
}
