import Link from "next/link";
import { ArrowRight, Sparkles, TrendingUp, Trophy, WandSparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOptionalUser } from "@/lib/auth";
import { getActionButtonClass } from "@/lib/ui/color-system";

export default async function LandingPage() {
  const user = await getOptionalUser();

  return (
    <main className="min-h-screen app-shell text-slate-900">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl items-center px-4 py-16">
        <Card className="relative w-full overflow-hidden rounded-3xl border border-slate-200/75 bg-white/92 shadow-[0_55px_150px_-70px_rgba(8,145,178,0.7)] backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 opacity-90">
            <div className="absolute -left-8 top-10 h-60 w-60 rounded-full bg-cyan-400/30 blur-3xl" />
            <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-amber-300/25 blur-3xl" />
            <div className="absolute bottom-0 left-1/3 h-56 w-56 rounded-full bg-emerald-400/25 blur-3xl" />
          </div>
          <CardHeader className="relative grid gap-6 pb-2 lg:grid-cols-[1.45fr_1fr] lg:items-end">
            <div className="space-y-4">
              <Badge className="w-fit border border-cyan-300/50 bg-cyan-100 text-cyan-700">
                SportsRank Portfolio
              </Badge>
              <CardTitle className="max-w-3xl text-4xl leading-tight tracking-tight sm:text-5xl">
                The most visual way to build your weekly sports edge.
              </CardTitle>
              <p className="max-w-2xl text-sm text-slate-600 sm:text-base">
                Build your board with real imported odds, allocate credits like a portfolio, and
                climb rankings with cleaner decisions.
              </p>
              <div className="flex flex-wrap gap-2 text-xs text-slate-700">
                <span className="inline-flex items-center gap-1 rounded-full border border-cyan-200/70 bg-cyan-50 px-3 py-1">
                  <Sparkles className="size-3.5 text-cyan-600" />
                  Daily + weekly boards
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200/70 bg-emerald-50 px-3 py-1">
                  <TrendingUp className="size-3.5 text-emerald-600" />
                  10,000 weekly credits
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200/70 bg-amber-50 px-3 py-1">
                  <WandSparkles className="size-3.5 text-amber-600" />
                  Animated, focused UX
                </span>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">⚽ Football</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">🏀 Basketball</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">🎾 Tennis</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">⛳ Golf</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">🏎️ Motor</span>
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">🌍 Multi-country</span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              <div className="rounded-2xl border border-cyan-200/70 bg-cyan-50 p-3">
                <p className="text-xs uppercase tracking-wide text-cyan-700">Live rounds</p>
                <p className="mt-1 text-2xl font-semibold">Mon → Sun</p>
              </div>
              <div className="rounded-2xl border border-emerald-200/70 bg-emerald-50 p-3">
                <p className="text-xs uppercase tracking-wide text-emerald-700">Core flow</p>
                <p className="mt-1 text-2xl font-semibold">Pick · Stake · Track</p>
              </div>
              <div className="rounded-2xl border border-amber-200/70 bg-amber-50 p-3">
                <p className="text-xs uppercase tracking-wide text-amber-700">Leaderboard</p>
                <p className="mt-1 flex items-center gap-2 text-2xl font-semibold">
                  <Trophy className="h-5 w-5" />
                  Settled rounds
                </p>
              </div>
            </div>
          </CardHeader>
          <CardContent className="relative flex flex-wrap gap-3 pt-4">
            <Button asChild size="lg" className={getActionButtonClass("primary")}>
              <Link href={user ? "/dashboard" : "/login"}>
                {user ? "Go to dashboard" : "Start now"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            {!user ? (
              <Button
                asChild
                variant="outline"
                size="lg"
                className="border-emerald-200/70 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              >
                <Link href="/login">Login</Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
