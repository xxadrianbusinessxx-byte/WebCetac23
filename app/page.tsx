import type { ReactNode } from "react";
import { actionAlumnosEstrella } from "@/app/actions/home";
import { AlumnosEstrellaPanel } from "@/app/components/alumnos-estrella";
import { EventosInicio } from "@/app/components/eventos-inicio";
import { FrutigerBackdrop } from "./components/frutiger-backdrop";
import { HomeLoginForm } from "./components/home-login-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AulaNube — Inicio de sesión",
  description: "Acceso a la plataforma escolar.",
};

function GlassShell({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[1.75rem] border border-white/60 bg-white/30 shadow-[0_8px_32px_rgba(56,189,248,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 ${className}`}
    >
      {children}
    </div>
  );
}

function PanelTab() {
  return (
    <div className="mb-3 flex justify-center">
      <div className="min-h-9 min-w-[5rem] rounded-2xl border border-sky-900/20 px-4 py-2 shadow-[inset_0_2px_0_rgba(255,255,255,0.2),inset_0_-2px_0_rgba(0,0,0,0.15)] bg-linear-to-b from-sky-700 via-sky-800 to-sky-950" />
    </div>
  );
}

function SectionPill({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex justify-center">
      <div className="rounded-full border border-white/70 bg-linear-to-b from-sky-200/90 via-sky-100/80 to-white/70 px-6 py-2 text-center text-xs font-extrabold uppercase tracking-widest text-sky-900 shadow-[0_4px_16px_rgba(14,165,233,0.2),inset_0_1px_0_rgba(255,255,255,0.95)]">
        {children}
      </div>
    </div>
  );
}

export default async function Home() {
  const alumnosEstrella = await actionAlumnosEstrella();

  return (
    <FrutigerBackdrop>
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:max-w-7xl lg:px-8 lg:pt-8">
        <div className="mb-5 flex h-11 items-stretch overflow-hidden rounded-full border border-white/65 bg-white/35 py-1 pl-1 pr-1 shadow-[0_8px_28px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:h-12">
          <div className="min-w-0 flex-1 rounded-full bg-white/10" />
          <div
            className="ml-1 w-[38%] max-w-md shrink-0 rounded-full border border-white/25 bg-linear-to-b from-sky-600 via-sky-800 to-sky-950 shadow-[inset_0_2px_0_rgba(255,255,255,0.2),inset_0_-2px_0_rgba(0,0,0,0.2)] sm:w-[32%]"
            aria-hidden
          />
        </div>

        <div className="mb-6 grid flex-1 grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6 lg:items-start">
          <section className="lg:col-span-3">
            <GlassShell className="p-5 sm:p-6">
              <SectionPill>Alumnos estrella</SectionPill>
              <AlumnosEstrellaPanel alumnos={alumnosEstrella} />
            </GlassShell>
          </section>

          <section className="lg:col-span-5">
            <GlassShell className="p-6 sm:p-8">
              <PanelTab />
              <SectionPill>Inicio de sesión</SectionPill>
              <HomeLoginForm />
            </GlassShell>
          </section>

          <section className="lg:col-span-4">
            <GlassShell className="flex h-full min-h-[320px] flex-col p-5 sm:p-6">
              <SectionPill>Eventos</SectionPill>
              <EventosInicio />
            </GlassShell>
          </section>
        </div>
      </div>
    </FrutigerBackdrop>
  );
}
