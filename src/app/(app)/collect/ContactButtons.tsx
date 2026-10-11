"use client";
// 📞 + WhatsApp reminder for one customer's open orders (§11.6) or one order (§11.4).
// The reminder goes out through the wa.me deep-link fallback (§13) until P6 wires
// the WhatsApp API; every tap is logged as a FollowUp and the 48 h cooldown is
// enforced server-side.
import * as React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageCircle, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/app/Toast";
import { sendReminderAction, logCallAction } from "./actions";

export function ContactButtons(props: {
  phoneE164: string;
  orderIds: string[];
  reminderHref: string; // prebuilt wa.me link with the reminder text
  reminderBlockedUntil: string | null; // ISO — all orders in cooldown
  compact?: boolean;
}) {
  const t = useTranslations("collect");
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const blocked = props.reminderBlockedUntil !== null;

  function call() {
    // Fire-and-forget: never hold up the dialer.
    void logCallAction({ orderIds: props.orderIds }).then(() => router.refresh());
  }

  async function remind() {
    // Open the tab synchronously so mobile browsers don't treat it as a pop-up.
    // ("noopener" would make window.open return null, so detach the opener by hand.)
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setPending(true);
    try {
      const r = await sendReminderAction({ orderIds: props.orderIds });
      if (!r.ok) {
        tab?.close();
        toast.error(r.error.message);
        return;
      }
      if (tab) tab.location.href = props.reminderHref;
      else window.location.href = props.reminderHref;
      toast.success(t("reminderLogged"));
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const size = props.compact ? "sm" : "md";
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size={size} asChild>
        <a href={`tel:${props.phoneE164}`} onClick={call} aria-label={t("call")}>
          <Phone className="h-4 w-4" />
          {!props.compact && t("call")}
        </a>
      </Button>
      <Button
        variant="outline"
        size={size}
        onClick={remind}
        disabled={pending || blocked}
        title={
          blocked
            ? t("remindedTitle", {
                when: new Date(props.reminderBlockedUntil!).toLocaleString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: "Asia/Kolkata",
                }),
              })
            : undefined
        }
      >
        <MessageCircle className="h-4 w-4" />
        {blocked ? t("reminded") : t("whatsapp")}
      </Button>
    </div>
  );
}
