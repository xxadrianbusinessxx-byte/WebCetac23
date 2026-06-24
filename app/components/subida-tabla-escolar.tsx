"use client";

import type { ChangeEvent, ReactNode, RefObject } from "react";
import { GuiPasos } from "@/app/components/gui-pasos";
import { MateriaTablaVistaPanel } from "@/app/components/materia-tabla-vista";
import type { MateriaTablaVista } from "@/lib/escolar/types";

const PASOS_SUBIDA = [
  "Elige la tabla en la lista de arriba.",
  "Pulsa «Elegir archivo» y selecciona tu Excel o CSV (.csv, .tsv, .xlsx, .xls).",
  "Espera el mensaje «Archivo listo: nombre del archivo».",
  "Pulsa «Cargar a la base» para reemplazar el contenido de esa tabla en Supabase.",
] as const;

function GreyActionPill({
  children,
  onClick,
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

function esMensajeExito(mensaje: string): boolean {
  return /archivo subido|subido correctamente/i.test(mensaje);
}

type Props = {
  tablaSeleccionada: string;
  vista: MateriaTablaVista | null;
  cargandoVista: boolean;
  archivo: File | null;
  subiendo: boolean;
  mensaje: string | null;
  onElegirArchivo: () => void;
  onArchivoElegido: (event: ChangeEvent<HTMLInputElement>) => void;
  onCargar: () => void;
  inputRef: RefObject<HTMLInputElement | null>;
  vacioTexto?: string;
  className?: string;
};

export function SubidaTablaEscolar({
  tablaSeleccionada,
  vista,
  cargandoVista,
  archivo,
  subiendo,
  mensaje,
  onElegirArchivo,
  onArchivoElegido,
  onCargar,
  inputRef,
  vacioTexto,
  className = "",
}: Props) {
  const exito = mensaje ? esMensajeExito(mensaje) : false;
  const listo = mensaje?.startsWith("Archivo listo:") ?? false;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <GuiPasos titulo="¿Cómo subir el archivo?" pasos={PASOS_SUBIDA} />

      <div className="flex min-h-[240px] flex-1 flex-col rounded-[1.5rem] border border-white/45 bg-slate-500/20 p-3 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm sm:min-h-[280px] sm:p-4">
        {cargandoVista ? (
          <p className="flex flex-1 items-center justify-center text-sm font-semibold text-slate-600">
            Cargando vista de la tabla…
          </p>
        ) : (
          <MateriaTablaVistaPanel
            vista={vista}
            materiaNombre={tablaSeleccionada}
            vacioTexto={vacioTexto}
            vistaCompleta
          />
        )}
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <GreyActionPill onClick={onElegirArchivo} disabled={subiendo}>
          Elegir archivo
        </GreyActionPill>
        <GreyActionPill
          onClick={onCargar}
          disabled={subiendo || !archivo}
          className={archivo ? "ring-2 ring-sky-400/50" : ""}
        >
          {subiendo ? "Cargando a la base…" : "Cargar a la base"}
        </GreyActionPill>
      </div>

      {mensaje && (
        <p
          className={`text-xs font-semibold ${
            exito
              ? "text-emerald-800"
              : listo
                ? "text-sky-900"
                : "text-red-700"
          }`}
          role="status"
        >
          {mensaje}
        </p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.xls,text/csv"
        className="sr-only"
        onChange={onArchivoElegido}
        aria-label="Seleccionar archivo de calificaciones"
      />
    </div>
  );
}
