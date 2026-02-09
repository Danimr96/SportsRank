"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, History, LayoutDashboard, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

interface MobileNavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
}

const MOBILE_NAV_ITEMS: MobileNavItem[] = [
  { href: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/history", label: "Historial", icon: History },
  { href: "/admin/rounds", label: "Admin", icon: Shield },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/round/");
  }
  if (href === "/admin/rounds") {
    return pathname.startsWith("/admin");
  }
  return pathname === href;
}

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-300/80 bg-bone-50/95 backdrop-blur md:hidden">
      <div className="mx-auto grid max-w-[620px] grid-cols-5 px-2 pb-[max(env(safe-area-inset-bottom),0.45rem)] pt-1.5">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "mx-0.5 flex flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-medium transition-colors",
                active
                  ? "bg-forest text-bone"
                  : "text-ink/70 hover:bg-bone-100 hover:text-ink",
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
