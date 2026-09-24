"use client";

/**
 * constancia-estudios-vista-previa.tsx — «Trámites escolares › Constancias de
 * estudios › Vista previa». BETA (2026-09-24).
 *
 * Pinta la constancia del alumno elegido con lo que el sistema ya sabe de él. El
 * texto lo arma `constancia-puro.ts`; aquí solo se dibuja. Los datos que todavía
 * no existen (folio, CCT, firma, sello) se ven como HUECOS marcados, no como
 * valores inventados: es una vista previa, no un documento emitido, y tiene que
 * notarse.
 */
import { useState } from "react";
import { armarConstancia, PLANTEL, type DatosConstancia } from "@/lib/escolar/administracion/constancia-puro";

function Hueco({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded border border-dashed border-amber-600 bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
      {children}
    </span>
  );
}

export function ConstanciaEstudiosVistaPrevia({ datos }: { datos: Omit<DatosConstancia, "fecha"> }) {
  // La fecha se fija al montar: la vista previa no debe cambiar de día a mitad de lectura.
  const [fecha] = useState(() => new Date());
  const c = armarConstancia({ ...datos, fecha });

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[var(--oc-border-active)] bg-[var(--oc-input)] px-4 py-3">
        <p className="text-xs font-extrabold uppercase tracking-widest text-[var(--oc-mint)]">Beta · vista previa</p>
        <p className="mt-1 text-sm text-[var(--oc-text)]">
          Se arma con los datos que ya hay del alumno. Todavía no se emite: para hacerlo de forma
          automática faltan datos institucionales que el sistema aún no guarda.
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {c.faltantesInstitucion.map((f) => (
            <li
              key={f}
              className="rounded-full border border-[var(--oc-border)] px-3 py-1 text-[11px] font-semibold text-[var(--oc-muted)]"
            >
              {f}
            </li>
          ))}
        </ul>
      </div>

      {c.faltantesAlumno.length > 0 && (
        <p className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-3 text-sm text-[var(--oc-alert-text)]">
          Faltan datos del alumno para armar el texto: {c.faltantesAlumno.join(", ")}.
        </p>
      )}

      {/* La hoja: papel claro a propósito, para que se lea como el documento que será. */}
      <article
        aria-label="Vista previa de la constancia de estudios"
        className="mx-auto w-full max-w-3xl rounded-lg bg-white px-6 py-8 text-slate-900 shadow-lg sm:px-12 sm:py-12"
      >
        <header className="flex flex-col items-center gap-1 border-b border-slate-300 pb-4 text-center">
          <p className="text-sm font-bold uppercase tracking-wide">{PLANTEL}</p>
          <p className="text-xs text-slate-600">
            CCT: <Hueco>pendiente</Hueco>
          </p>
        </header>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm">
          <p>
            Folio: <Hueco>pendiente</Hueco>
          </p>
          <p>{c.lugarYFecha}</p>
        </div>

        <h2 className="mt-8 text-center text-lg font-bold tracking-widest">{c.titulo}</h2>

        <p className="mt-8 text-sm font-bold">{c.destinatario}</p>
        <p className="mt-4 text-justify text-sm leading-relaxed">
          {c.cuerpo ?? <Hueco>Faltan datos del alumno</Hueco>}
        </p>
        <p className="mt-4 text-justify text-sm leading-relaxed">{c.cierre}</p>

        <footer className="mt-16 flex flex-col items-center gap-2 text-center text-sm">
          <p className="font-bold">ATENTAMENTE</p>
          <div className="mt-10 w-64 border-t border-slate-500 pt-2">
            <Hueco>Nombre, cargo y firma</Hueco>
          </div>
          <div className="mt-4">
            <Hueco>Sello del plantel</Hueco>
          </div>
        </footer>
      </article>
    </div>
  );
}
