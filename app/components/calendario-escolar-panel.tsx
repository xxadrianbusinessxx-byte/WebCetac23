"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  actionEliminarDiaCalendario,
  actionEliminarDiaCalendarioDePeriodo,
  actionEstablecerCalendarioBase,
  actionEstablecerCalendarioBaseDePeriodo,
  actionGuardarDiaCalendario,
  actionGuardarDiaCalendarioDePeriodo,
  actionListarCiclosEscolares,
  actionObtenerCalendario,
  actionObtenerCalendarioDePeriodo,
  actionPrevisualizarCalendarioBase,
} from "@/app/actions/calendario";
import type { DiaCalendarioRow } from "@/lib/escolar/calendario";
import { fechaISO } from "@/lib/escolar/calendario";
import {
  TIPOS_DIA_CALENDARIO,
  type TipoDiaCalendario,
} from "@/lib/escolar/tables";

function PanelTab({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px] ${className}`}
    >
      {children}
    </span>
  );
}

function GreyActionPill({
  children,
  className = "",
  onClick,
  type = "button",
  disabled,
}: {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
    >
      {children}
    </button>
  );
}

/** Etiquetas y colores por tipo de día. */
const INFO_TIPO: Record<
  TipoDiaCalendario,
  { etiqueta: string; simbolo: string; clase: string; texto: string }
> = {
  clase: {
    etiqueta: "Clase",
    simbolo: "🟢",
    clase: "bg-emerald-200/80 border-emerald-500/60 text-emerald-900",
    texto: "text-emerald-800",
  },
  festivo: {
    etiqueta: "Festivo",
    simbolo: "🔴",
    clase: "bg-red-200/80 border-red-500/60 text-red-900",
    texto: "text-red-800",
  },
  mantenimiento: {
    etiqueta: "Mantenimiento",
    simbolo: "🟡",
    clase: "bg-amber-200/80 border-amber-500/60 text-amber-900",
    texto: "text-amber-800",
  },
  descanso: {
    etiqueta: "Descanso",
    simbolo: "⚪",
    clase: "bg-slate-200/80 border-slate-400/60 text-slate-700",
    texto: "text-slate-700",
  },
};

const NOMBRES_MESES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const NOMBRES_DIAS = ["L", "M", "M", "J", "V", "S", "D"];

export function CalendarioEscolarPanel({ cicloInicial, periodoIdInicial, periodoNombre }: { cicloInicial?: string; periodoIdInicial?: string; periodoNombre?: string } = {}) {

  // Ciclo seleccionado y lista de ciclos existentes.
  const [ciclos, setCiclos] = useState<string[]>([]);
  const [ciclo, setCiclo] = useState("");
  const modoPeriodo = Boolean(periodoIdInicial);
  const [dias, setDias] = useState<DiaCalendarioRow[]>([]);
  const [cargando, setCargando] = useState(false);

  // Configuración de la base del calendario.
  const [nuevoCiclo, setNuevoCiclo] = useState("");
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [previewMsg, setPreviewMsg] = useState<string | null>(null);

  const [generando, setGenerando] = useState(false);

  // Mes visible en el calendario visual.
  const hoy = new Date();
  const [mesVisible, setMesVisible] = useState(
    new Date(hoy.getFullYear(), hoy.getMonth(), 1),
  );

  // Día seleccionado para editar.
  const [seleccionado, setSeleccionado] = useState<string | null>(null);
  const [tipoSeleccionado, setTipoSeleccionado] =
    useState<TipoDiaCalendario>("clase");
  const [descripcionSeleccionada, setDescripcionSeleccionada] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargarCiclos = useCallback(async () => {
    if (modoPeriodo) {
      setCiclos([]);
      return;
    }
    const lista = await actionListarCiclosEscolares();
    setCiclos(lista);
    if (lista.length > 0 && !ciclo) {
      const preferido = cicloInicial?.trim().toUpperCase();
      setCiclo(preferido && lista.includes(preferido) ? preferido : lista[0]!);
    }
  }, [ciclo, cicloInicial]);

  useEffect(() => {
    if (modoPeriodo) return;
    void cargarCiclos();
  }, [cargarCiclos]);

  // Contexto explícito: si el workspace cambia de ciclo, el panel le sigue.
  useEffect(() => {
    if (modoPeriodo) return;
    const preferido = cicloInicial?.trim().toUpperCase();
    if (preferido && ciclos.includes(preferido)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCiclo(preferido);
    }
  }, [cicloInicial, ciclos]);

  const cargarDias = useCallback(async (c: string) => {
    if (!c && !modoPeriodo) {
      setDias([]);
      return;
    }
    setCargando(true);
    const filas = modoPeriodo
      ? await actionObtenerCalendarioDePeriodo(periodoIdInicial ?? "", periodoNombre ?? "")
      : await actionObtenerCalendario(c);
    setDias(filas);
    setCargando(false);
  }, [modoPeriodo, periodoIdInicial, periodoNombre]);

  const claveCarga = modoPeriodo ? `periodo:${periodoIdInicial ?? ""}` : ciclo;
  useEffect(() => {
    void cargarDias(claveCarga);
  }, [claveCarga, cargarDias]);

  // Mapa fecha -> día para el mes visible.
  const diasPorFecha = useMemo(() => {
    const mapa = new Map<string, DiaCalendarioRow>();
    for (const d of dias) mapa.set(d.fecha, d);
    return mapa;
  }, [dias]);

  // Celdas del mes visible (con huecos para alinear el primer día).
  const celdasMes = useMemo(() => {
    const anio = mesVisible.getFullYear();
    const mes = mesVisible.getMonth();
    const primerDia = new Date(anio, mes, 1);
    const offset = (primerDia.getDay() + 6) % 7; // lunes = 0
    const totalDias = new Date(anio, mes + 1, 0).getDate();
    const celdas: (string | null)[] = [];
    for (let i = 0; i < offset; i++) celdas.push(null);
    for (let d = 1; d <= totalDias; d++) {
      celdas.push(fechaISO(new Date(anio, mes, d)));
    }
    return celdas;
  }, [mesVisible]);

  function cambiarMes(delta: number) {
    setMesVisible(
      (prev) => new Date(prev.getFullYear(), prev.getMonth() + delta, 1),
    );
    setSeleccionado(null);
  }

  async function onPrevisualizar() {
    setError(null);
    setPreviewMsg(null);
    if (!inicio || !fin) {
      setError("Indica el rango de fechas del ciclo.");
      return;
    }
    const res = await actionPrevisualizarCalendarioBase(inicio, fin);
    if (res.ok) {
      setPreviewMsg(
        `Se generarán ${res.dias} día(s) escolar(es) (lunes a viernes).`,
      );
    } else {
      setError(res.error);
    }
  }


  async function onGenerarBase() {
    setError(null);
    setMensaje(null);
    if (modoPeriodo && !periodoIdInicial) {
      setError("Falta el periodo (periodoId).");
      return;
    }
    const cicloFinal = modoPeriodo ? (periodoNombre ?? "") : (nuevoCiclo.trim() || ciclo);
    if (!cicloFinal && !modoPeriodo) {
      setError("Indica el ciclo escolar.");
      return;
    }
    if (!inicio || !fin) {
      setError("Indica el rango de fechas del ciclo.");
      return;
    }
    setGenerando(true);
    const res = modoPeriodo
      ? await actionEstablecerCalendarioBaseDePeriodo(periodoIdInicial ?? "", periodoNombre ?? "", inicio, fin)
      : await actionEstablecerCalendarioBase(cicloFinal, inicio, fin);
    setGenerando(false);
    if (res.ok) {
      setMensaje(
        `Calendario base listo: ${res.generados} día(s) marcado(s) como clase.`,
      );
      setPreviewMsg(null);
      if (modoPeriodo) {
        await cargarDias(`periodo:${periodoIdInicial ?? ""}`);
      } else {
        setNuevoCiclo("");
        await cargarCiclos();
        setCiclo(cicloFinal);
        await cargarDias(cicloFinal);
      }
    } else {
      setError(res.error);
    }
  }

  function onSeleccionarDia(fecha: string) {
    const dia = diasPorFecha.get(fecha);
    setSeleccionado(fecha);
    setTipoSeleccionado(dia?.tipo ?? "clase");
    setDescripcionSeleccionada(dia?.descripcion ?? "");
    setError(null);
    setMensaje(null);
  }

  async function onGuardarDia() {
    if (!seleccionado) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);
    const res = modoPeriodo
      ? await actionGuardarDiaCalendarioDePeriodo(
          periodoIdInicial ?? "",
          periodoNombre ?? "",
          seleccionado,
          tipoSeleccionado,
          descripcionSeleccionada,
        )
      : await actionGuardarDiaCalendario(
          ciclo,
          seleccionado,
          tipoSeleccionado,
          descripcionSeleccionada,
        );
    setGuardando(false);
    if (res.ok) {
      setMensaje(
        `Día ${seleccionado} guardado como ${INFO_TIPO[tipoSeleccionado].etiqueta}.`,
      );
      await cargarDias(ciclo);
    } else {
      setError(res.error);
    }
  }

  async function onEliminarDia() {
    if (!seleccionado) return;
    setGuardando(true);
    setError(null);
    setMensaje(null);
    const res = modoPeriodo
      ? await actionEliminarDiaCalendarioDePeriodo(periodoIdInicial ?? "", seleccionado)
      : await actionEliminarDiaCalendario(ciclo, seleccionado);
    setGuardando(false);
    if (res.ok) {
      setMensaje(`Día ${seleccionado} eliminado del calendario.`);
      setSeleccionado(null);
      await cargarDias(ciclo);
    } else {
      setError(res.error);
    }
  }

  const diaSeleccionado = seleccionado ? diasPorFecha.get(seleccionado) : null;

  return (
    <div className="relative flex flex-1 flex-col gap-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4">
      <PanelTab className="mx-auto w-fit">Calendario escolar</PanelTab>

      <div className="relative z-[1] flex flex-col gap-4">
        {/* Mensajes */}
        {mensaje && (
          <p className="text-center text-xs font-semibold text-sky-900" role="status">
            {mensaje}
          </p>
        )}
        {error && (
          <p className="text-center text-xs font-semibold text-red-700" role="alert">
            {error}
          </p>
        )}

        {/* Selector de ciclo */}
        <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <label className="text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
            Ciclo escolar
          </label>
          <select
            value={ciclo}
            onChange={(e) => setCiclo(e.target.value)}
            className="min-w-[10rem] flex-1 rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
          >
            <option value="">Selecciona un ciclo…</option>
            {ciclos.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <span className="text-[10px] font-semibold text-slate-600">
            {cargando ? "Cargando…" : `${dias.length} día(s) registrado(s)`}
          </span>
        </div>

        {/* Configuración de la base del calendario */}
        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
            Crear / actualizar calendario base (lunes a viernes = clase)
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={nuevoCiclo}
              onChange={(e) => setNuevoCiclo(e.target.value)}
              placeholder="Ciclo (ej. 2026-2027)"
              className="min-w-[8rem] flex-1 rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
            />
            <input
              type="date"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              aria-label="Fecha inicial del ciclo"
              className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
            />
            <span className="text-xs font-bold text-slate-600">→</span>
            <input
              type="date"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              aria-label="Fecha final del ciclo"
              className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
            />
            <GreyActionPill onClick={onPrevisualizar}>Previsualizar</GreyActionPill>
            <GreyActionPill onClick={onGenerarBase} disabled={generando}>
              {generando ? "Generando…" : "Generar base"}
            </GreyActionPill>
          </div>
          {previewMsg && (
            <p className="mt-2 text-center text-xs font-semibold text-sky-900">
              {previewMsg}
            </p>
          )}
        </div>

        {/* Leyenda */}
        <div className="flex flex-wrap items-center justify-center gap-3 rounded-full border border-white/60 bg-white/55 px-3 py-2 text-[10px] font-bold text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-sm">
          {TIPOS_DIA_CALENDARIO.map((t) => (
            <span key={t} className="flex items-center gap-1">
              <span>{INFO_TIPO[t].simbolo}</span>
              {INFO_TIPO[t].etiqueta}
            </span>
          ))}
        </div>

        {/* Calendario visual mensual */}
        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <div className="mb-2 flex items-center justify-between">
            <GreyActionPill onClick={() => cambiarMes(-1)}>‹</GreyActionPill>
            <p className="text-sm font-extrabold uppercase tracking-wide text-sky-900">
              {NOMBRES_MESES[mesVisible.getMonth()]} {mesVisible.getFullYear()}
            </p>
            <GreyActionPill onClick={() => cambiarMes(1)}>›</GreyActionPill>
          </div>

          <div className="grid grid-cols-7 gap-1">
            {NOMBRES_DIAS.map((d, i) => (
              <div
                key={i}
                className="pb-1 text-center text-[10px] font-extrabold uppercase tracking-wide text-slate-500"
              >
                {d}
              </div>
            ))}
            {celdasMes.map((fecha, i) => {
              if (!fecha) return <div key={`v-${i}`} />;
              const dia = diasPorFecha.get(fecha);
              const tipo = dia?.tipo ?? "clase";
              const info = INFO_TIPO[tipo];
              const esSeleccionado = seleccionado === fecha;
              const esHoy = fecha === fechaISO(hoy);
              return (
                <button
                  key={fecha}
                  type="button"
                  onClick={() => onSeleccionarDia(fecha)}
                  className={`flex min-h-[3rem] flex-col items-center justify-center rounded-xl border p-1 text-xs font-bold transition hover:brightness-105 sm:min-h-[3.5rem] ${info.clase} ${
                    esSeleccionado ? "ring-2 ring-sky-500 ring-offset-1" : ""
                  } ${esHoy ? "outline outline-2 outline-sky-400" : ""}`}
                  title={dia?.descripcion ?? info.etiqueta}
                >
                  <span>{Number(fecha.slice(8))}</span>
                  <span className="text-[10px]">{info.simbolo}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor del día seleccionado */}
        {seleccionado && (
          <div className="rounded-3xl border border-sky-400/50 bg-sky-100/70 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.6)] backdrop-blur-md">
            <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
              Editar día {seleccionado}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <select
                value={tipoSeleccionado}
                onChange={(e) =>
                  setTipoSeleccionado(e.target.value as TipoDiaCalendario)
                }
                className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              >
                {TIPOS_DIA_CALENDARIO.map((t) => (
                  <option key={t} value={t}>
                    {INFO_TIPO[t].simbolo} {INFO_TIPO[t].etiqueta}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={descripcionSeleccionada}
                onChange={(e) => setDescripcionSeleccionada(e.target.value)}
                placeholder="Descripción opcional"
                className="min-w-[10rem] flex-1 rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              />
              <div className="flex gap-2">
                <GreyActionPill onClick={onGuardarDia} disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar"}
                </GreyActionPill>
                {diaSeleccionado && (
                  <GreyActionPill onClick={onEliminarDia} disabled={guardando}>
                    Eliminar
                  </GreyActionPill>
                )}
              </div>
            </div>
            {diaSeleccionado?.descripcion && (
              <p className="mt-2 text-center text-xs font-semibold text-slate-700">
                {diaSeleccionado.descripcion}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
