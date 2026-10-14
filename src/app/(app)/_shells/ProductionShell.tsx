import { Factory, Wrench } from "lucide-react";
import { AppShell } from "./AppShell";
import type { SessionUser } from "@/server/repo/users";

// Production login: the production board and service requests. No money anywhere.
export async function ProductionShell({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  const items = [
    { label: "Production", icon: <Factory className="h-5 w-5" />, href: "/production" },
    { label: "Service", icon: <Wrench className="h-5 w-5" />, href: "/service" },
  ];
  return (
    <AppShell user={user} items={items}>
      {children}
    </AppShell>
  );
}
