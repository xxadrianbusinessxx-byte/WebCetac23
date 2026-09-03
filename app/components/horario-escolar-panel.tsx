"use client";

import { useEffect, useMemo, useState } from "react";

import {
  actionConsultarHorarioGrupo,
  actionDescargarPlantillaHorario,
  actionImportarHorarioAplicar,
  actionImportarHorarioPreview,
  actionListarGruposDePeriodo,
  actionListarPeriodosCatalogo,
  type HorarioGrupoConsultable,
  type PeriodoCatalogoSimple,
} from "@/app/actions/horario";
import type { PreviewImportacionHorario } from "@/lib/escolar/horario-importar";

/**
 * HORARIO ESCOLAR — Panel del directivo (FASE HORARIO).
 *
 * · Importa el HORARIO SEMANAL OFICIAL (Excel) por periodo/ciclo.
 * · Muestra el reporte de la importación (válidas/nuevas/actualizables/
 *   duplicadas/rechazadas/errores por fila) antes de aplicar.
 * · Permite consultar el horario semanal por grupo/día.
 *
 * El resumen de clases por día del Excel se usa SOLO como advertencia de
 * validación cruzada; la fuente oficial es el detalle de bloques.
 */

type GrupoFiltro = { grado: string; grupo: string; carrera: string };

const DIAS_LABEL: Record<string, string> = {
  lunes: "Lunes",
  martes: "Martes",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
};

const ORDEN_DIAS = ["lunes", "martes", "miercoles", "jueves", "viernes"];

function PillButton({
  children,
  onClick,
  disabled = false,
  className = "",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border border-white/70 bg-linear-to-b from-sky-500 via-sky-600 to-sky-700 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-extrabold uppercase tracking-wide text-sky-900">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white outline-none focus:ring-2 focus:ring-sky-400/60"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function etiquetaGrupo(g: GrupoFiltro): string {
  return `${g.grado} ${g.grupo}${g.carrera ? ` · ${g.carrera}` : ""}`.trim();
}

export function HorarioEscolarPanel({ periodoIdInicial }: { periodoIdInicial?: string } = {}) {
  const [periodos, setPeriodos] = useState<PeriodoCatalogoSimple[]>([]);
  const [periodoId, setPeriodoId] = useState("");
  const [grupos, setGrupos] = useState<GrupoFiltro[]>([]);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewImportacionHorario | null>(null);
  const [previsualizando, setPrevisualizando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [resultadoAplicar, setResultadoAplicar] = useState<string | null>(null);
  const [descargandoPlantilla, setDescargandoPlantilla] = useState(false);
  const [mensajePlantilla, setMensajePlantilla] = useState<string | null>(null);

  // Consulta del horario por grupo.
  const [grado, setGrado] = useState("");
  const [grupo, setGrupo] = useState("");
  const [carrera, setCarrera] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [horario, setHorario] = useState<HorarioGrupoConsultable | null>(null);
  const [errorConsulta, setErrorConsulta] = useState<string | null>(null);

  // Cargar periodos del catálogo.
  useEffect(() => {
    let activo = true;
    void actionListarPeriodosCatalogo().then((r) => {
      if (!activo) return;
      if (r.ok) {
        setPeriodos(r.periodos);
        const inicial =
          periodoIdInicial && r.periodos.some((p) => p.id === periodoIdInicial)
            ? periodoIdInicial
            : (r.periodos[0]?.id ?? "");
        setPeriodoId(inicial);
      }
    });
    return () => {
      activo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Contexto explícito del workspace: si cambia el ciclo, el panel le sigue.
  useEffect(() => {
    if (periodoIdInicial && periodos.some((p) => p.id === periodoIdInicial)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPeriodoId(periodoIdInicial);
    }
  }, [periodoIdInicial, periodos]);

  // Cargar grupos del periodo seleccionado.
  useEffect(() => {
    if (!periodoId) return;
    let activo = true;
    void actionListarGruposDePeriodo(periodoId).then((r) => {
      if (!activo) return;
      if (r.ok) setGrupos(r.grupos);
    });
    return () => {
      activo = false;
    };
  }, [periodoId]);

  const periodoSeleccionado = useMemo(
    () => periodos.find((p) => p.id === periodoId) ?? null,
    [periodos, periodoId],
  );

  async function onPrevisualizar() {
    if (!archivo || !periodoSeleccionado) return;
    setPrevisualizando(true);
    setPreview(null);
    setResultadoAplicar(null);
    setConfirmado(false);
    const fd = new FormData();
    fd.set("archivo", archivo);
    const res = await actionImportarHorarioPreview(
      fd,
      periodoSeleccionado.nombre,
    );
    setPreview(res);
    setPrevisualizando(false);
  }

  async function onDescargarPlantilla() {
    setDescargandoPlantilla(true);
    setMensajePlantilla(null);
    const res = await actionDescargarPlantillaHorario();
    setDescargandoPlantilla(false);
    if (!res.ok) {
      setMensajePlantilla(res.error);
      return;
    }
    try {
      const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.nombreArchivo;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMensajePlantilla(
        `Plantilla descargada (${res.nombreArchivo}). Consérvala para actualizar el horario cuando cambie.`,
      );
    } catch {
      setMensajePlantilla("No se pudo generar la plantilla.");
    }
  }

  async function onAplicar() {
    if (!archivo || !periodoSeleccionado || !preview?.ok) return;
    if (!confirmado) {
      setResultadoAplicar("Confirma explícitamente antes de aplicar.");
      return;
    }
    setAplicando(true);
    setResultadoAplicar(null);
    const fd = new FormData();
    fd.set("archivo", archivo);
    const res = await actionImportarHorarioAplicar(
      fd,
      periodoSeleccionado.nombre,
    );
    setAplicando(false);
    if (res.ok) {
      setResultadoAplicar(
        `Horario aplicado: ${res.aplicadas} nuevas · ${res.actualizadas} actualizadas · ${res.eliminadas} eliminadas · ${res.sinCambios} sin cambios.`,
      );
      setPreview(null);
      setArchivo(null);
      setConfirmado(false);
    } else {
      setResultadoAplicar(res.error ?? "No se pudo aplicar el horario.");
    }
  }

  async function onConsultar() {
    if (!periodoSeleccionado || !grado || !grupo) return;
    setConsultando(true);
    setErrorConsulta(null);
    setHorario(null);
    const res = await actionConsultarHorarioGrupo({
      ciclo: periodoSeleccionado.nombre,
      grado,
      grupo,
      carrera,
    });
    setConsultando(false);
    if (!res.ok) {
      setErrorConsulta(res.error);
      return;
    }
    setHorario(res.horario);
  }

  const grados = [...new Set(grupos.map((g) => g.grado))].sort();
  const gruposDelGrado = [
    ...new Set(grupos.filter((g) => g.grado === grado).map((g) => g.grupo)),
  ].sort();
  const carrerasDelGrupo = [
    ...new Set(
      grupos
        .filter((g) => g.grado === grado && g.grupo === grupo)
        .map((g) => g.carrera)
        .filter(Boolean),
    ),
  ].sort();
  const grupoElegido =
    grupos.find(
      (g) => g.grado === grado && g.grupo === grupo && g.carrera === carrera,
    ) ?? null;

  function bloquesDe(dia: string) {
    return (horario?.bloques ?? []).filter((b) => b.diaSemana === dia);
  }

  function alElegirPeriodo(id: string) {
    setPeriodoId(id);
    setGrupos([]);
    setHorario(null);
    setGrado("");
    setGrupo("");
    setCarrera("");
  }

  function alElegirGrado(v: string) {
    setGrado(v);
    setGrupo("");
    setCarrera("");
    setHorario(null);
  }


  return (
    <>
    <section
      className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
      aria-label="Horario escolar"
    >
      <div className="relative z-[1] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-sky-900">
            Horario escolar (fuente oficial)
          </h2>
          <span className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white">
            Importar Excel del horario semanal
          </span>
        </div>

        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <p className="mb-3 text-center text-xs font-semibold text-slate-700">
            La hoja de detalle define los bloques programados por grupo y día.
            Re-subir el mismo archivo no genera duplicados (idempotente por
            periodo).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <select
              value={periodoId}
              onChange={(e) => alElegirPeriodo(e.target.value)}
              className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white outline-none"
              aria-label="Periodo escolar"
            >
              {periodos.length === 0 && <option value="">Sin periodos</option>}
              {periodos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setPreview(null);
                setResultadoAplicar(null);
                setConfirmado(false);
              }}
              className="max-w-xs rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 shadow-inner outline-none"
              aria-label="Seleccionar Excel del horario"
            />
            <PillButton
              onClick={() => void onPrevisualizar()}
              disabled={previsualizando || !archivo || !periodoSeleccionado}
            >
              {previsualizando ? "Analizando…" : "Previsualizar importación"}
            </PillButton>
          </div>


          <div className="mt-3 flex flex-wrap items-center gap-2">
            <PillButton
              onClick={() => void onDescargarPlantilla()}
              disabled={descargandoPlantilla}
              className="from-slate-400 via-slate-500 to-slate-600"
            >
              {descargandoPlantilla
                ? "Generando…"
                : "Descargar plantilla del horario (.xlsx)"}
            </PillButton>
            {mensajePlantilla && (
              <p
                className={`text-[11px] font-semibold ${
                  mensajePlantilla.startsWith("Plantilla descargada")
                    ? "text-emerald-900"
                    : "text-red-700"
                }`}
                role="status"
              >
                {mensajePlantilla}
              </p>
            )}
          </div>


          {preview && (
            <div className="mt-4 rounded-2xl border border-emerald-400/50 bg-emerald-100/70 p-3">
              {!preview.ok ? (
                <p className="text-center text-xs font-bold text-red-700" role="alert">
                  {preview.error}
                </p>
              ) : (
                <>
                  <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
                    Reporte — hoja «{preview.hojaDetalle}»
                  </p>
                  <ul className="grid grid-cols-2 gap-1 text-xs font-semibold text-emerald-900 sm:grid-cols-4">
                    <li>✅ Válidas: {preview.filasValidas}</li>
                    <li>✏️ Nuevas: {preview.nuevas}</li>
                    <li>🔄 Actualizables: {preview.actualizables}</li>
                    <li>⏸️ Sin cambios: {preview.sinCambios}</li>
                    <li>🗑️ A eliminar: {preview.aEliminar}</li>
                    <li>⛔ Rechazadas: {preview.filasRechazadas}</li>
                    <li>🔗 Vinculadas: {preview.materiasVinculadasCatalogo}</li>
                    <li>🧩 Sin vínculo: {preview.materiasSinVinculo}</li>
                  </ul>
                  {preview.gruposEncontrados.length > 0 && (
                    <p className="mt-2 text-[11px] font-semibold text-emerald-900">
                      Grupos: {preview.gruposEncontrados.join(" · ")}
                    </p>
                  )}
                  {preview.profesoresEncontrados.length > 0 && (
                    <p className="mt-1 text-[11px] font-semibold text-emerald-900">
                      Profesores: {preview.profesoresEncontrados.join(" · ")}
                    </p>
                  )}
                  {preview.advertencias.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-wide text-amber-800">
                        Advertencias ({preview.advertencias.length})
                      </summary>
                      <ul className="mt-1 max-h-32 overflow-y-auto rounded-xl bg-white/60 p-2 text-[11px] font-semibold text-amber-900">
                        {preview.advertencias.map((a, i) => (
                          <li key={i}>{a}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                  {preview.erroresPorFila.length > 0 && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-wide text-red-700">
                        Errores por fila ({preview.erroresPorFila.length}) — bloquean
                      </summary>
                      <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl bg-white/60 p-2 text-[11px] font-semibold text-red-800">
                        {preview.erroresPorFila.slice(0, 60).map((r, i) => (
                          <li key={i}>
                            Fila {r.filaOrigen}: {r.grupoLegible || r.materia || "—"} —{" "}
                            {r.errores.join("; ") || "rechazada"}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-[11px] font-extrabold text-emerald-900">
                      <input
                        type="checkbox"
                        checked={confirmado}
                        onChange={(e) => setConfirmado(e.target.checked)}
                        disabled={preview.bloqueaEscritura}
                      />
                      Confirmo aplicar este horario al periodo
                    </label>
                    <PillButton
                      onClick={() => void onAplicar()}
                      disabled={aplicando || preview.bloqueaEscritura || !confirmado}
                      className="from-emerald-500 via-emerald-600 to-emerald-700"
                    >
                      {aplicando ? "Aplicando…" : "Aplicar horario"}
                    </PillButton>
                  </div>
                  {preview.bloqueaEscritura && (
                    <p className="mt-2 text-[11px] font-bold text-red-700">
                      Corrige los errores y vuelve a previsualizar.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          {resultadoAplicar && (
            <p
              className={`mt-3 text-center text-xs font-bold ${
                resultadoAplicar.includes("aplicado:")
                  ? "text-emerald-900"
                  : "text-red-700"
              }`}
              role="status"
            >
              {resultadoAplicar}
            </p>
          )}
        </div>
      </div>

    </section>

    <section
      className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-emerald-800/50 bg-emerald-100/35 p-3 shadow-[0_12px_40px_rgba(16,185,129,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
      aria-label="Consultar horario por grupo"
    >
      <div className="relative z-[1] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-emerald-900">
            Consultar horario de un grupo
          </h2>
          <span className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white">
            {periodoSeleccionado?.nombre ?? "—"}
          </span>
        </div>

        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <FieldSelect
              label="Grado"
              value={grado}
              onChange={alElegirGrado}
              options={grados}
              placeholder="Selecciona grado"
            />
            <FieldSelect
              label="Grupo"
              value={grupo}
              onChange={(v) => {
                setGrupo(v);
                setCarrera("");
                setHorario(null);
              }}
              options={gruposDelGrado}
              placeholder="Selecciona grupo"
            />
            <FieldSelect
              label="Carrera (opcional)"
              value={carrera}
              onChange={(v) => {
                setCarrera(v);
                setHorario(null);
              }}
              options={carrerasDelGrupo}
              placeholder="Todas / tronco común"
            />
            <div className="flex items-end">
              <PillButton
                onClick={() => void onConsultar()}
                disabled={consultando || !grado || !grupo}
                className="from-emerald-500 via-emerald-600 to-emerald-700"
              >
                {consultando ? "Consultando…" : "Consultar"}
              </PillButton>
            </div>
          </div>
          {grupoElegido && (
            <p className="mt-2 text-[11px] font-bold text-emerald-900">
              {etiquetaGrupo(grupoElegido)}
            </p>
          )}
          {errorConsulta && (
            <p className="mt-2 text-center text-xs font-bold text-red-700" role="alert">
              {errorConsulta}
            </p>
          )}

          {horario && (
            <div className="mt-4 overflow-x-auto">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-emerald-800">
                Semana — {horario.grupo.grado} {horario.grupo.grupo}
                {horario.grupo.carreraClave ? ` · ${horario.grupo.carreraClave}` : ""}
              </p>
              <div className="grid min-w-[760px] grid-cols-5 gap-2">
                {ORDEN_DIAS.map((dia) => {
                  const bloques = bloquesDe(dia);
                  const total = horario.resumenPorDia[dia] ?? 0;
                  return (
                    <div
                      key={dia}
                      className="rounded-2xl border border-white/60 bg-white/70 p-2"
                    >
                      <p className="text-center text-[10px] font-extrabold uppercase tracking-wide text-emerald-900">
                        {DIAS_LABEL[dia]} · {total}
                      </p>
                      {bloques.length === 0 ? (
                        <p className="mt-1 text-center text-[10px] font-semibold text-slate-400">
                          —
                        </p>
                      ) : (
                        bloques.map((b, i) => (
                          <div
                            key={i}
                            className="mt-1 rounded-xl border border-white/70 bg-emerald-50 px-2 py-1"
                          >
                            <p className="text-[10px] font-extrabold text-emerald-900">
                              {b.horaInicio}–{b.horaFin} · {b.tipoEtiqueta}
                            </p>
                            <p className="text-[10px] font-semibold leading-tight text-slate-700">
                              {b.materiaNombre}
                            </p>
                            <p className="text-[10px] font-semibold text-emerald-700">
                              {b.profesor}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
    </>
  );
}

