"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, LayoutDashboard, Shield, Trophy } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { MobileNav } from "@/components/layout/mobile-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface AppHeaderProps {
  userEmail?: string;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/history", label: "History", icon: null },
  { href: "/admin/rounds", label: "Admin", icon: Shield },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname.startsWith("/round/");
  }
  if (href === "/admin/rounds") {
    return pathname.startsWith("/admin");
  }
  if (href === "/calendar") {
    return pathname === "/calendar";
  }
  return pathname === href;
}

export function AppHeader({ userEmail }: AppHeaderProps) {
  const pathname = usePathname();

  return (
    <>
    <header className="sticky top-0 z-30 border-b border-stone-300/70 bg-bone/95 backdrop-blur-sm">
      <div className="mx-auto flex w-full max-w-[1200px] items-center justify-between gap-4 px-4 py-4 md:px-6">
        <Link href="/" className="inline-flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-forest text-bone">
            <Trophy className="h-4 w-4" />
          </span>
          <div>
            <p className="font-display text-lg leading-none text-ink">SportsRank</p>
            <p className="text-xs uppercase tracking-[0.12em] text-ink/60">Weekly portfolio picks</p>
          </div>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-stone-400/50 bg-bone-50 p-1 md:flex">
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            const Icon = item.icon;

            return (
              <Button
                key={item.href}
                asChild
                variant="ghost"
                size="sm"
                className={cn(
                  "h-8 px-3.5 text-sm",
                  active
                    ? "bg-forest text-bone hover:bg-forest"
                    : "text-ink/75 hover:bg-bone-100 hover:text-ink",
                )}
              >
                <Link href={item.href} className="inline-flex items-center gap-1.5">
                  {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
                  {item.label}
                </Link>
              </Button>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          {userEmail ? (
            <span className="hidden text-sm text-ink/65 lg:inline">{userEmail}</span>
          ) : null}
          {userEmail ? (
            <form action={signOutAction}>
              <Button type="submit" size="sm" variant="outline">
                Sign out
              </Button>
            </form>
          ) : (
            <Button asChild size="sm" variant="outline">
              <Link href="/login">Login</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
    {userEmail ? <MobileNav /> : null}
    </>
  );
}
