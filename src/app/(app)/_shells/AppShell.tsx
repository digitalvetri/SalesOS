import { TopBar } from "./TopBar";
import { SideNav, BottomNav, type NavItem } from "./SideNav";
import type { SessionUser } from "@/server/repo/users";

// One responsive frame for every role. Role shells only decide the nav items.
//   < 768   top bar + bottom tab bar
//   ≥ 768   icon rail (tablet) / full sidebar (≥ 1280) + top bar
export function AppShell({
  user,
  items,
  children,
}: {
  user: SessionUser;
  items: NavItem[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh">
      <SideNav items={items} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} />
        <main className="pb-bottom-nav min-w-0 flex-1">{children}</main>
      </div>
      <BottomNav items={items} />
    </div>
  );
}
