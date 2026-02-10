import Link from "next/link";
import {
  BarChart3,
  BookOpenText,
  CalendarDays,
  Coins,
  Flag,
  PlayCircle,
  ShieldCheck,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getOptionalUser } from "@/lib/auth";
import { getActionButtonClass } from "@/lib/ui/color-system";

const QUICK_STEPS = [
  {
    title: "1) Entra en Dashboard",
    detail:
      "Verás tu jornada activa (lunes-domingo), créditos disponibles y picks por deporte.",
    icon: PlayCircle,
  },
  {
    title: "2) Elige picks y stake",
    detail:
      "Abre un pick, selecciona opción y define stake dentro del rango permitido de la jornada.",
    icon: Target,
  },
  {
    title: "3) Revisa exposición",
    detail:
      "Comprueba cuánto has invertido por deporte/board y evita concentrarte demasiado en un solo mercado.",
    icon: Coins,
  },
  {
    title: "4) Sigue el calendario",
    detail:
      "En Calendar puedes ver partidos por día y deporte para decidir antes de que empiecen.",
    icon: CalendarDays,
  },
  {
    title: "5) Analiza tu rendimiento",
    detail:
      "En Analytics revisa live range (mejor/peor posición), histórico y clasificación por jornada.",
    icon: BarChart3,
  },
];

export default async function TutorialPage() {
  const user = await getOptionalUser();

  return (
    <main className="min-h-screen app-shell text-ink">
      <section className="mx-auto w-full max-w-[1100px] px-4 py-10 md:px-6 md:py-14">
        <div className="surface-canvas space-y-6 rounded-[1.75rem] p-5 md:p-8">
          <header className="surface-subtle rounded-2xl p-5">
            <div className="space-y-3">
              <Badge variant="outline" className="w-fit">
                New user guide
              </Badge>
              <h1 className="font-display text-[clamp(1.8rem,1.2rem+2vw,3rem)] leading-[1.02] text-ink">
                Cómo empezar en SportsRank
              </h1>
              <p className="max-w-3xl text-sm text-ink/70 md:text-base">
                Tutorial rápido para entender la app, construir picks con criterio y seguir tu
                posición en vivo sin tocar configuraciones técnicas.
              </p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild className={getActionButtonClass("primary")}>
                <Link href={user ? "/dashboard" : "/login"}>
                  {user ? "Ir al Dashboard" : "Crear cuenta / Login"}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/calendar">Ver calendario</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/analytics">Ver analytics</Link>
              </Button>
            </div>
          </header>

          <section className="grid gap-3 md:grid-cols-2">
            {QUICK_STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <Card key={step.title} className="rounded-2xl">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base text-ink">
                      <Icon className="size-4 text-forest" />
                      {step.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-ink/70">{step.detail}</p>
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <section className="grid gap-3 lg:grid-cols-3">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Coins className="size-4 text-forest" />
                  Reglas de créditos
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-ink/75">
                <p>• Cada jornada empieza con 10.000 créditos.</p>
                <p>• Puedes dejar cash sin usar.</p>
                <p>• Cada selección respeta stake mínimo/máximo y múltiplos del paso de ronda.</p>
                <p>• No puedes editar cuando empieza el evento o cierra la jornada.</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Flag className="size-4 text-forest" />
                  Clasificación live
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-ink/75">
                <p>• `Current`: posición actual con lo ya seleccionado.</p>
                <p>• `Best`: posición potencial si todo sale a favor.</p>
                <p>• `Worst`: escenario contrario.</p>
                <p>• Puedes filtrar por deporte y por jornada.</p>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="size-4 text-forest" />
                  Transparencia y seguridad
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-ink/75">
                <p>• Las odds no se inventan: vienen de fuentes externas/import JSON.</p>
                <p>• La lógica de validación y settlement está testeada en dominio puro.</p>
                <p>• Tu entrada se controla por autenticación y políticas RLS en Supabase.</p>
              </CardContent>
            </Card>
          </section>

          <section className="surface-subtle rounded-2xl p-4">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <BookOpenText className="size-4 text-forest" />
              Consejo rápido para mejorar resultados
            </p>
            <p className="mt-1 text-sm text-ink/70">
              No intentes “apostarlo todo” en un solo bloque. Reparte stake entre deportes/ligas y
              revisa el calendario antes de cada kickoff para mantener más opciones abiertas.
            </p>
          </section>
        </div>
      </section>
    </main>
  );
}
