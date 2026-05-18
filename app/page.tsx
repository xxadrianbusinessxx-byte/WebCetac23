import type { ReactNode } from "react";
import { FrutigerBackdrop } from "./components/frutiger-backdrop";
import { GlossyPersonIcon } from "./components/glossy-person-icon";
import { HomeLoginForm } from "./components/home-login-form";

export const metadata = {
  title: "AulaNube — Inicio de sesión",
  description: "Acceso a la plataforma escolar.",
};

function GlassShell({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-[1.75rem] border border-white/60 bg-white/30 shadow-[0_8px_32px_rgba(56,189,248,0.14),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 ${className}`}
    >
      {children}
    </div>
  );
}

/** Pestaña superior oscura tipo wireframe (SCROLL GUI / vacía en centro). */
function PanelTab({ label }: { label?: string }) {
  return (
    <div className="mb-3 flex justify-center">
      <div
        className={`min-h-9 min-w-[7rem] rounded-2xl border border-sky-900/20 px-4 py-2 text-center text-[11px] font-extrabold uppercase tracking-wider text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.2),inset_0_-2px_0_rgba(0,0,0,0.15)] bg-linear-to-b from-sky-700 via-sky-800 to-sky-950 ${label ? "" : "min-w-[5rem]"}`}
      >
        {label ?? <span className="inline-block h-3 w-10 opacity-0" aria-hidden />}
      </div>
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

function StarStudentCell({ uid }: { uid: string }) {
  return (
    <div className="aspect-square rounded-3xl border-2 border-sky-900/35 bg-white/80 p-2 shadow-[inset_0_2px_0_rgba(255,255,255,0.95),0_6px_16px_rgba(14,165,233,0.15)]">
      <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-sky-100/80 to-sky-200/40">
        <GlossyPersonIcon
          uid={uid}
          className="h-[78%] w-[78%] drop-shadow-[0_4px_8px_rgba(2,132,199,0.35)]"
        />
        <div
          className="pointer-events-none absolute inset-x-2 top-1 h-[38%] rounded-b-[100%] bg-linear-to-b from-white/55 to-transparent"
          aria-hidden
        />
      </div>
    </div>
  );
}

function EventPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex min-h-[140px] flex-1 items-center justify-center rounded-[1.35rem] border border-sky-950/25 bg-linear-to-b from-sky-800 via-sky-900 to-sky-950 px-4 py-8 text-center text-xs font-bold uppercase tracking-widest text-sky-100/90 shadow-[inset_0_3px_0_rgba(255,255,255,0.12),inset_0_-4px_0_rgba(0,0,0,0.25),0_8px_24px_rgba(2,6,23,0.2)]">
      {label}
    </div>
  );
}

export default function Home() {
  return (
    <FrutigerBackdrop>
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:max-w-7xl lg:px-8 lg:pt-8">
        {/* Barra superior tipo wireframe */}
        <div className="mb-5 flex h-11 items-stretch overflow-hidden rounded-full border border-white/65 bg-white/35 py-1 pl-1 pr-1 shadow-[0_8px_28px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:h-12">
          <div className="min-w-0 flex-1 rounded-full bg-white/10" />
          <div
            className="ml-1 w-[38%] max-w-md shrink-0 rounded-full border border-white/25 bg-linear-to-b from-sky-600 via-sky-800 to-sky-950 shadow-[inset_0_2px_0_rgba(255,255,255,0.2),inset_0_-2px_0_rgba(0,0,0,0.2)] sm:w-[32%]"
            aria-hidden
          />
        </div>

        <div className="mb-6 grid flex-1 grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6 lg:items-start">
          {/* Izquierda: Alumnos estrella */}
          <section className="lg:col-span-3">
            <GlassShell className="p-5 sm:p-6">
              <SectionPill>Alumnos estrella</SectionPill>
              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {["a", "b", "c", "d"].map((uid) => (
                  <StarStudentCell key={uid} uid={uid} />
                ))}
              </div>
            </GlassShell>
          </section>

          {/* Centro: inicio de sesión */}
          <section className="lg:col-span-5">
            <GlassShell className="p-6 sm:p-8">
              <PanelTab />
              <SectionPill>Inicio de sesión</SectionPill>
              <HomeLoginForm />
            </GlassShell>
          </section>

          {/* Derecha: eventos */}
          <section className="lg:col-span-4">
            <GlassShell className="flex h-full min-h-[320px] flex-col p-5 sm:p-6">
              <SectionPill>Eventos</SectionPill>
              <div className="flex flex-1 flex-col gap-4">
                <EventPlaceholder label="Imagen de evento" />
                <EventPlaceholder label="Imagen de evento 2" />
              </div>
            </GlassShell>
          </section>
        </div>
      </div>
    </FrutigerBackdrop>
  );
}
