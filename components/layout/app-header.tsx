import Link from "next/link";
import { BarChart3, LayoutDashboard, Shield, Trophy } from "lucide-react";
import { signOutAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

interface AppHeaderProps {
  userEmail?: string;
}

export function AppHeader({ userEmail }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-300/70 bg-[#fff7ea]/92 text-slate-900 backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-emerald-500/0 via-cyan-600/70 to-violet-600/0" />
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="inline-flex items-center gap-2 font-semibold">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-cyan-600 via-blue-600 to-emerald-600 text-white shadow-[0_12px_24px_-14px_rgba(37,99,235,0.85)]">
            <Trophy className="h-4 w-4" />
          </span>
          <span className="font-display bg-gradient-to-r from-cyan-700 via-blue-700 to-emerald-700 bg-clip-text text-transparent">
            SportsRank
          </span>
        </Link>

        <nav className="flex items-center gap-1 rounded-full border border-slate-300/85 bg-[#fffdf8]/95 p-1 shadow-[0_12px_30px_-22px_rgba(30,64,175,0.35)] backdrop-blur">
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-slate-700 hover:bg-cyan-100 hover:text-cyan-900"
          >
            <Link href="/dashboard" className="inline-flex items-center gap-1.5">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Dashboard
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-slate-700 hover:bg-emerald-100 hover:text-emerald-900"
          >
            <Link href="/analytics" className="inline-flex items-center gap-1.5">
              <BarChart3 className="h-3.5 w-3.5" />
              Analytics
            </Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-slate-700 hover:bg-violet-100 hover:text-violet-900"
          >
            <Link href="/history">History</Link>
          </Button>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-slate-700 hover:bg-amber-100 hover:text-amber-900"
          >
            <Link href="/admin/rounds" className="inline-flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" />
              Admin
            </Link>
          </Button>
        </nav>

        <div className="flex items-center gap-3">
          {userEmail ? (
            <span className="hidden text-xs text-slate-600 sm:inline">{userEmail}</span>
          ) : null}
          {userEmail ? (
            <form action={signOutAction}>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="border-cyan-400/70 bg-cyan-100/70 text-cyan-900 hover:bg-cyan-100"
              >
                Sign out
              </Button>
            </form>
          ) : (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-cyan-400/70 bg-cyan-100/70 text-cyan-900 hover:bg-cyan-100"
            >
              <Link href="/login">Login</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
