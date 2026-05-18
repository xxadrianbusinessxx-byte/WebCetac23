"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  actionActualizarEstatusDirectivo,
  actionActualizarEtiquetasPersonales,
  actionObtenerVistaMateria,
} from "@/app/actions/escolar";
import { MateriaScrollPicker } from "@/app/components/materia-scroll-picker";
import { MateriaTablaVistaPanel } from "@/app/components/materia-tabla-vista";
import {
  etiquetasEstatusDesdeFila,
  etiquetasPersonalesDesdeFila,
} from "@/lib/escolar/etiquetas";
import { nombreCompletoAlumno } from "@/lib/escolar/alumnos";
import type {
  AlumnoRow,
  ComentarioRow,
  EtiquetasPersonalesRow,
  MateriaTablaVista,
} from "@/lib/escolar/types";
import { FrutigerBackdrop } from "../components/frutiger-backdrop";
import { GlossyNavPill } from "../components/glossy-nav-pill";
import { GlossyPersonIcon } from "../components/glossy-person-icon";

type MainTab = "materia" | "estatus" | "comentarios" | "boleta";
type MateriaSub = "asignaturas" | "personal";

function BubblePill({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border border-white/70 bg-white/88 px-3 py-2 text-center text-[10px] font-bold uppercase leading-tight text-sky-900 shadow-[inset_0_2px_0_rgba(255,255,255,0.95),0_2px_8px_rgba(14,165,233,0.12)] sm:text-xs ${className}`}
    >
      {children}
    </span>
  );
}

function MainTabButton({
  id,
  label,
  selected,
  onSelect,
}: {
  id: MainTab;
  label: string;
  selected: boolean;
  onSelect: (id: MainTab) => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={() => onSelect(id)}
      className={`min-w-0 flex-1 rounded-t-2xl border border-b-0 px-2 py-3 text-[10px] font-extrabold uppercase tracking-wide transition sm:px-4 sm:text-xs ${
        selected
          ? "relative z-[1] border-sky-800/25 bg-white/92 text-sky-800 shadow-[inset_0_2px_0_rgba(255,255,255,1),0_-4px_16px_rgba(14,165,233,0.08)]"
          : "border-transparent bg-slate-400/75 text-slate-700 shadow-[inset_0_-2px_0_rgba(0,0,0,0.08)] hover:bg-slate-400/90"
      } ${selected ? "" : "translate-y-px"}`}
    >
      <span
        className={`relative block ${selected ? "before:pointer-events-none before:absolute before:inset-x-1 before:top-0 before:h-[40%] before:rounded-b-[100%] before:bg-linear-to-b before:from-white/55 before:to-transparent" : ""}`}
      >
        {label}
      </span>
    </button>
  );
}

const estatusCol1 = [
  "Promedio",
  "Promedio 2do",
  "Promedio 3ro",
  "Promedio 4to",
  "Promedio 5to",
  "Promedio 6to",
];
const estatusCol2 = [
  "Materias reprobadas",
  "Materia 1",
  "Materia 2",
  "Materia 3",
  "Materia 4",
  "Materia 5 etc.",
];

type PerfilDatos = {
  alumno: AlumnoRow | null;
  etiquetas: EtiquetasPersonalesRow | null;
  comentarios: ComentarioRow[];
  puedeEditarEstatus: boolean;
};

type Props = {
  materias: readonly string[];
  modoDirectivo: boolean;
  datos: PerfilDatos;
};

export function PerfilClient({ materias, modoDirectivo, datos }: Props) {
  const { alumno, etiquetas, comentarios, puedeEditarEstatus } = datos;
  const nombreMostrar = alumno ? nombreCompletoAlumno(alumno) : "Nombre";
  const [tab, setTab] = useState<MainTab>("materia");
  const [materiaSub, setMateriaSub] = useState<MateriaSub>("asignaturas");
  const [materiaSeleccionada, setMateriaSeleccionada] = useState(
    materias[0] ?? "",
  );
  const [vistaMateria, setVistaMateria] = useState<MateriaTablaVista | null>(
    null,
  );
  const [e1, setE1] = useState(etiquetasEstatusDesdeFila(etiquetas)[0]);
  const [e2, setE2] = useState(etiquetasEstatusDesdeFila(etiquetas)[1]);
  const [e3, setE3] = useState(etiquetasEstatusDesdeFila(etiquetas)[2]);
  const [p1, setP1] = useState(etiquetasPersonalesDesdeFila(etiquetas)[0]);
  const [p2, setP2] = useState(etiquetasPersonalesDesdeFila(etiquetas)[1]);
  const [p3, setP3] = useState(etiquetasPersonalesDesdeFila(etiquetas)[2]);

  const refrescarMateria = useCallback(async (nombre: string) => {
    const vista = await actionObtenerVistaMateria(nombre);
    setVistaMateria(vista);
  }, []);

  useEffect(() => {
    if (materiaSeleccionada) void refrescarMateria(materiaSeleccionada);
  }, [materiaSeleccionada, refrescarMateria]);

  return (
    <FrutigerBackdrop>
      <div className="relative z-10 mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-24 pt-6 sm:px-6 lg:max-w-6xl lg:px-8 lg:pt-8">
        {modoDirectivo && (
          <div className="mb-4 rounded-2xl border border-amber-400/60 bg-amber-100/90 px-4 py-3 text-center text-sm font-bold text-amber-950 shadow-md">
            Modo directivo
            {nombreMostrar !== "Nombre" ? `: ${nombreMostrar}` : ""} — puedes editar
            contenido sensible (información personal, estatus y boleta).
          </div>
        )}
        {/* Barra Perfil / Chat */}
        <div className="mb-6 flex h-14 items-center justify-center gap-3 rounded-full border-[3px] border-sky-800/55 bg-sky-200/45 px-3 py-2 shadow-[0_8px_28px_rgba(56,189,248,0.18),inset_0_1px_0_rgba(255,255,255,0.85)] backdrop-blur-xl backdrop-saturate-150 sm:mb-8 sm:h-16 sm:justify-between sm:px-6">
          <GlossyNavPill href="/perfil" active>
            Perfil
          </GlossyNavPill>
          <GlossyNavPill href="/chat?origen=perfil">Chat</GlossyNavPill>
        </div>

        {/* Cabecera avatar + nombre */}
        <div className="mb-6 flex flex-col items-stretch gap-4 sm:mb-8 sm:flex-row sm:items-center">
          <div className="relative flex h-28 w-28 shrink-0 items-center justify-center rounded-[1.75rem] border-[3px] border-sky-900/70 bg-white/75 p-2 shadow-[0_10px_28px_rgba(14,165,233,0.2),inset_0_2px_0_rgba(255,255,255,0.95)] backdrop-blur-md sm:h-32 sm:w-32">
            <div className="relative flex h-full w-full items-center justify-center overflow-hidden rounded-2xl bg-linear-to-b from-sky-100/90 to-sky-300/50">
              <GlossyPersonIcon
                uid="perfil-main"
                genero="masculino"
                className="h-[82%] w-[82%] drop-shadow-[0_6px_12px_rgba(2,132,199,0.4)]"
              />
              <div
                className="pointer-events-none absolute inset-x-2 top-1 h-[40%] rounded-b-[100%] bg-linear-to-b from-white/60 to-transparent"
                aria-hidden
              />
            </div>
          </div>

          <div className="flex min-h-[4.5rem] min-w-0 flex-1 items-stretch overflow-hidden rounded-full border-[3px] border-sky-900/70 bg-linear-to-r from-sky-900 via-sky-900 to-sky-900/90 shadow-[0_8px_24px_rgba(2,6,23,0.12)] backdrop-blur-sm sm:min-h-[5.5rem]">
            <div
              className="w-10 shrink-0 bg-sky-950 sm:w-12"
              aria-hidden
            />
            <div className="relative flex flex-1 items-center justify-center bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4">
              <span className="text-lg font-extrabold tracking-wide text-white drop-shadow-sm sm:text-xl">
                {nombreMostrar}
              </span>
              <div
                className="pointer-events-none absolute inset-x-6 top-1 h-[38%] rounded-b-[100%] bg-linear-to-b from-white/35 to-transparent"
                aria-hidden
              />
            </div>
          </div>
        </div>

        {/* Contenedor principal con pestañas */}
        <div className="relative flex flex-1 flex-col overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4">
          <div
            className="pointer-events-none absolute inset-0 z-0 rounded-[2rem] opacity-[0.12]"
            aria-hidden
            style={{
              backgroundImage: `radial-gradient(circle at 20% 30%, white 0%, transparent 45%), radial-gradient(circle at 80% 70%, #7dd3fc 0%, transparent 40%)`,
            }}
          />

          <div
            role="tablist"
            aria-label="Secciones del perfil"
            className="relative z-[1] flex gap-1 px-1 pt-1 sm:gap-2 sm:px-2"
          >
            <MainTabButton
              id="materia"
              label="Materia"
              selected={tab === "materia"}
              onSelect={setTab}
            />
            <MainTabButton
              id="estatus"
              label="Estatus"
              selected={tab === "estatus"}
              onSelect={setTab}
            />
            <MainTabButton
              id="comentarios"
              label="Comentarios"
              selected={tab === "comentarios"}
              onSelect={setTab}
            />
            <MainTabButton
              id="boleta"
              label="Boleta"
              selected={tab === "boleta"}
              onSelect={setTab}
            />
          </div>

          <div
            role="tabpanel"
            className="relative z-[1] mt-0 min-h-[280px] rounded-3xl rounded-tl-none border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md sm:min-h-[360px] sm:p-6 md:min-h-[400px]"
          >
            {tab === "materia" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap gap-2 rounded-full border border-white/60 bg-white/55 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-sm">
                    <MateriaScrollPicker
                      materias={materias}
                      seleccionada={materiaSeleccionada}
                      onSeleccionar={setMateriaSeleccionada}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMateriaSub("asignaturas")}
                      className={`rounded-full px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide ${
                        materiaSub === "asignaturas"
                          ? "border border-sky-800/30 bg-white/90 text-sky-900 shadow-md"
                          : "border border-white/50 bg-white/40 text-sky-800"
                      }`}
                    >
                      Vista materias
                    </button>
                    <button
                      type="button"
                      onClick={() => setMateriaSub("personal")}
                      className={`rounded-full px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide ${
                        materiaSub === "personal"
                          ? "border border-sky-800/30 bg-white/90 text-sky-900 shadow-md"
                          : "border border-white/50 bg-white/40 text-sky-800"
                      }`}
                    >
                      Información personal
                    </button>
                  </div>
                </div>

                {materiaSub === "asignaturas" ? (
                  <div className="flex min-h-[220px] flex-1 items-center justify-center rounded-[1.5rem] border border-white/45 bg-slate-500/20 px-6 py-16 text-center text-sm font-semibold text-slate-700 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm sm:min-h-[280px]">
                    <MateriaTablaVistaPanel
                      vista={vistaMateria}
                      materiaNombre={materiaSeleccionada}
                    />
                  </div>
                ) : (
                  <div className="flex flex-col gap-4">
                    <div className="inline-flex w-fit rounded-full border border-white/70 bg-white/90 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-sky-900 shadow-sm">
                      Información personal
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                      {[
                        ["CURP", alumno?.CURP],
                        ["Nombre", alumno?.NOMBRE],
                        ["Apellido P", alumno?.P_APELLIDO],
                        ["Apellido M", alumno?.S_APELLIDO],
                        ["Clave", alumno?.CLAVE],
                        ["Género", etiquetas?.GENERO],
                        ["Grado", etiquetas?.GRADO],
                        ["Grupo", etiquetas?.GRUPO],
                      ].map(([l, v]) => (
                        <BubblePill key={l} className="min-h-[2.75rem]">{l}: {v ?? "—"}</BubblePill>
                      ))}
                    </div>
                    <div className="rounded-full border border-white/75 bg-white/90 px-5 py-4 text-center text-sm font-bold text-sky-900 shadow-[inset_0_2px_0_rgba(255,255,255,1)]">
                      Comentarios del alumno acerca de él
                    </div>
                  </div>
                )}
              </div>
            )}

            {tab === "estatus" && (
              <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0">
                <div className="grid min-w-[36rem] grid-cols-4 gap-2 sm:min-w-0 sm:gap-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={`estatus-row-${i}`} className="contents">
                      <BubblePill>{estatusCol1[i]}</BubblePill>
                      <BubblePill>{estatusCol2[i]}</BubblePill>
                      <BubblePill>{i === 0 ? e1 : i === 1 ? e2 : "—"}</BubblePill>
                      <BubblePill>{i === 0 ? p1 : i === 1 ? p2 : p3}</BubblePill>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {tab === "comentarios" && (
              <ul className="flex flex-col gap-4">
                {comentarios.length === 0 && (
                  <li className="text-center text-sm font-semibold text-slate-600">
                    Sin comentarios en COMENTARIOS.
                  </li>
                )}
                {comentarios.map((c, i) => (
                  <li key={`${c.CURP}-${i}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <span className="shrink-0 rounded-full border border-white/80 bg-white/95 px-4 py-2 text-center text-[11px] font-extrabold uppercase tracking-wide text-sky-800 sm:min-w-[8.5rem]">
                      Comentario
                    </span>
                    <div className="relative min-h-[3rem] flex-1 rounded-full border border-white/60 bg-slate-400/35 px-4 py-3 text-sm font-bold text-sky-900">
                      {c.COMENTARIO}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {tab === "boleta" && (
              <div className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-[1.5rem] border border-dashed border-white/50 bg-slate-500/15 px-6 py-12 text-center backdrop-blur-sm sm:min-h-[300px]">
                <p className="text-sm font-extrabold uppercase tracking-widest text-sky-950">
                  Boleta
                </p>
                <p className="max-w-md text-sm font-medium text-slate-700">
                  Espacio reservado para calificaciones y resumen del ciclo.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </FrutigerBackdrop>
  );
}
