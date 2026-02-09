import { AppHeader } from "@/components/layout/app-header";
import { AnalyticsDashboard } from "@/components/analytics/analytics-dashboard";
import { getUserOrRedirect } from "@/lib/auth";
import { listGlobalAnalyticsRows, listUserAnalyticsRows } from "@/lib/data/analytics";
import { createClient } from "@/lib/supabase/server";

export default async function AnalyticsPage() {
  const user = await getUserOrRedirect();
  const supabase = await createClient();

  const userRowsPromise = listUserAnalyticsRows(supabase, user.id);

  let globalRows: Awaited<ReturnType<typeof listGlobalAnalyticsRows>> = [];
  let globalError: string | null = null;

  try {
    globalRows = await listGlobalAnalyticsRows(supabase);
  } catch (error) {
    globalError = (error as Error).message;
  }

  const userRows = await userRowsPromise;

  return (
    <main className="min-h-screen app-shell text-slate-900">
      <AppHeader userEmail={user.email} />
      <section className="mx-auto w-full max-w-6xl px-4 py-8">
        <AnalyticsDashboard
          userRows={userRows}
          globalRows={globalRows}
          globalError={globalError}
        />
      </section>
    </main>
  );
}
