// v1.1 §1.1 — WhatsApp automation is removed; the settings page redirects.
import { redirect } from "next/navigation";

export default function WhatsAppSettingsRedirect() {
  redirect("/settings");
}
