import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="min-h-screen app-shell text-slate-900">
      <section className="mx-auto grid min-h-screen w-full max-w-6xl items-center gap-8 px-4 py-20 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-4">
          <p className="inline-flex items-center rounded-full border border-cyan-200/70 bg-cyan-50 px-3 py-1 text-xs uppercase tracking-wide text-cyan-700">
            Secure access
          </p>
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">
            Colorful portfolio.
            <br />
            Clean decisions.
          </h1>
          <p className="max-w-lg text-sm text-slate-600 sm:text-base">
            Log in to build your weekly board, monitor your exposure, and climb the rankings with
            a sharper visual workflow.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">⚽ 🇬🇧 🇪🇸</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">🏀 🇺🇸</span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">🎾 🌍</span>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
