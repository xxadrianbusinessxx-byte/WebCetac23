"use client";

import { useCallback, useEffect, useState } from "react";

import {
  actionCrearCicloEscolar,
  actionDetalleCicloAdmin,
  actionGuardarEvaluacion,
  actionGuardarRangoCiclo,
  actionListarCiclosAdmin,
  actionListarCiclosConEvaluaciones,
  actionSetActivoCiclo,
  actionSetActivoEvaluacion,
  type CicloAdminListado,
  type CicloEvaluacionListado,
  type DetalleCicloAdmin,
} from "@/app/actions/evaluaciones";
import {
  actionBuscarAlumnosInscripcion,
  actionInscribirAlumnoEnCiclo,
  actionListarGruposPeriodo,
} from "@/app/actions/inscripciones-admin";

/**
 * FASE CICLO — Panel del directivo: ciclos escolares + periodos de evaluación.
 * - Crear/activar/desactivar ciclo (históricos nunca se borran).
 * - Rango de fechas del ciclo (opcional).
 * - Parciales configurables (cantidad no fija) con inicio y cierre.
 * La autorización real (rol directivo) la validan las Server Actions.
 */

type CicloDraft = { inicio: string; fin: string };

type EvalDraft = {
  key: string;
  id?: string;
  periodoId: string;
  numero: string;
  nombre: string;
  inicio: string;
  fin: string;
  activo: boolean;
};

export function CicloEvaluacionesAdmin() {
  const [ciclos, setCiclos] = useState<CicloEvaluacionListado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "err"; texto: string } | null>(null);

  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoInicio, setNuevoInicio] = useState("");
  const [nuevoFin, setNuevoFin] = useState("");

  const [draftsCiclo, setDraftsCiclo] = useState<Record<string, CicloDraft>>({});
  const [draftsEval, setDraftsEval] = useState<Record<string, EvalDraft>>({});

  // F2 — estado conceptual por ciclo (BORRADOR/OPERATIVO/HISTORICO) + detalle.
  const [adminById, setAdminById] = useState<Record<string, CicloAdminListado>>({});
  const [detalleOpen, setDetalleOpen] = useState<Record<string, boolean>>({});
  const [detalle, setDetalle] = useState<Record<string, DetalleCicloAdmin | "cargando">>({});

  // F3 — inscripción administrativa dentro del detalle del ciclo.
  const [gruposCiclo, setGruposCiclo] = useState<
    Record<string, Array<{ id: string; grado: string; grupo: string; carreraClave: string; activo: boolean }> | "cargando">
  >({});
  const [busqueda, setBusqueda] = useState("");
  const [resultados, setResultados] = useState<Array<{ curp: string; nombre: string }>>([]);
  const [curpSel, setCurpSel] = useState("");
  const [grupoSel, setGrupoSel] = useState("");

  const aplicarResultado = useCallback(
    (r: { ok: true; ciclos: CicloEvaluacionListado[] } | { ok: false; error: string }) => {
      setCargando(false);
      if (!r.ok) {
        setMensaje({ tipo: "err", texto: r.error });
        return;
      }
      setCiclos(r.ciclos);
      const cd: Record<string, CicloDraft> = {};
      const ed: Record<string, EvalDraft> = {};
      for (const c of r.ciclos) {
        cd[c.periodo.id] = {
          inicio: c.periodo.fecha_inicio ?? "",
          fin: c.periodo.fecha_fin ?? "",
        };
        for (const ev of c.evaluaciones) {
          ed[ev.id] = {
            key: ev.id,
            id: ev.id,
            periodoId: ev.periodo_id,
            numero: String(ev.numero),
            nombre: ev.nombre,
            inicio: ev.fecha_inicio,
            fin: ev.fecha_fin,
            activo: ev.activo,
          };
        }
      }
      setDraftsCiclo(cd);
      setDraftsEval(ed);
    },
    [],
  );

  // F2 — carga ligera del listado administrativo + ciclos con evaluaciones.
  const recargar = useCallback(async () => {
    const [r, adm] = await Promise.all([
      actionListarCiclosConEvaluaciones(),
      actionListarCiclosAdmin(),
    ]);
    aplicarResultado(r);
    if (adm.ok) {
      const m: Record<string, CicloAdminListado> = {};
      for (const c of adm.ciclos) m[c.id] = c;
      setAdminById(m);
      setDetalle({});
    } else {
      setMensaje({ tipo: "err", texto: adm.error });
    }
  }, [aplicarResultado]);

  useEffect(() => {
    let activo = true;
    void Promise.all([
      actionListarCiclosConEvaluaciones(),
      actionListarCiclosAdmin(),
    ]).then(([r, adm]) => {
      if (!activo) return;
      aplicarResultado(r);
      if (adm.ok) {
        const m: Record<string, CicloAdminListado> = {};
        for (const c of adm.ciclos) m[c.id] = c;
        setAdminById(m);
      } else {
        setMensaje({ tipo: "err", texto: adm.error });
      }
    });
    return () => {
      activo = false;
    };
  }, [aplicarResultado]);

  function avisarRes(r: { ok: boolean; mensaje?: string; error?: string }) {
    setMensaje({
      tipo: r.ok ? "ok" : "err",
      texto: r.ok ? (r.mensaje ?? "") : (r.error ?? ""),
    });
  }

  async function onCreateCiclo() {
    const r = await actionCrearCicloEscolar({
      nombre: nuevoNombre,
      fechaInicio: nuevoInicio || undefined,
      fechaFin: nuevoFin || undefined,
    });
    avisarRes(r);
    if (r.ok) {
      setNuevoNombre("");
      setNuevoInicio("");
      setNuevoFin("");
      await recargar();
    }
  }

  async function onGuardarRango(periodoId: string) {
    const d = draftsCiclo[periodoId];
    if (!d) return;
    const r = await actionGuardarRangoCiclo({
      periodoId,
      fechaInicio: d.inicio || null,
      fechaFin: d.fin || null,
    });
    avisarRes(r);
    if (r.ok) await recargar();
  }

  // F2 — etiqueta conceptual (BORRADOR/OPERATIVO/HISTORICO) o compatibilidad.
  function estadoVisible(id: string): { etiqueta: string; clase: string } {
    const ad = adminById[id];
    if (ad?.esquema) {
      if (ad.estado === "operativo") return { etiqueta: "OPERATIVO", clase: "bg-emerald-200 text-emerald-900" };
      if (ad.estado === "borrador") return { etiqueta: "BORRADOR", clase: "bg-amber-200 text-amber-900" };
      return { etiqueta: "HISTORICO", clase: "bg-slate-300 text-slate-700" };
    }
    return ad?.activo
      ? { etiqueta: "OPERATIVO", clase: "bg-emerald-200 text-emerald-900" }
      : { etiqueta: "INACTIVO · esquema F1 pendiente", clase: "bg-orange-200 text-orange-900" };
  }

  // F2 — el botón "Activar" valida primero (F1) y solo entonces llama al server;
  // la protección real sigue siendo la Server Action (setActivoCiclo → F1).
  async function cargarDetalle(id: string) {
    setDetalle((p) => ({ ...p, [id]: "cargando" }));
    setGruposCiclo((p) => ({ ...p, [id]: "cargando" }));
    const [r, g] = await Promise.all([
      actionDetalleCicloAdmin(id),
      actionListarGruposPeriodo(id),
    ]);
    if (!r.ok) {
      setMensaje({ tipo: "err", texto: r.error });
      setDetalle((p) => {
        const n = { ...p };
        delete n[id];
        return n;
      });
      setGruposCiclo((p) => ({ ...p, [id]: [] }));
      return;
    }
    setDetalle((p) => ({ ...p, [id]: r.detalle }));
    setGruposCiclo((p) => ({ ...p, [id]: g.ok ? g.grupos : [] }));
    setResultados([]);
    setCurpSel("");
    setGrupoSel("");
  }

  function alternarDetalle(id: string) {
    const abierto = detalleOpen[id] === true;
    setDetalleOpen({ ...detalleOpen, [id]: !abierto });
    if (!abierto && detalle[id] === undefined) void cargarDetalle(id);
  }

  async function onActivarCiclo(id: string) {
    setDetalle((p) => ({ ...p, [id]: "cargando" }));
    const d = await actionDetalleCicloAdmin(id);
    if (!d.ok) {
      setMensaje({ tipo: "err", texto: d.error });
      return;
    }
    setDetalle((p) => ({ ...p, [id]: d.detalle }));
    if (!d.detalle.ok) {
      const bloqueos = d.detalle.errores.map((e) => `· ${e.mensaje}`).join("\n");
      setMensaje({
        tipo: "err",
        texto: `El ciclo tiene bloqueantes de integridad y NO puede activarse:\n${bloqueos}`,
      });
      return;
    }
    const r = await actionSetActivoCiclo(id, true);
    avisarRes(r);
    if (r.ok) {
      setDetalleOpen({});
      await recargar();
    }
  }

  async function onDesactivarCiclo(id: string) {
    const r = await actionSetActivoCiclo(id, false);
    avisarRes(r);
    if (r.ok) await recargar();
  }

  async function onBuscarAlumnos() {
    const r = await actionBuscarAlumnosInscripcion(busqueda);
    if (!r.ok) {
      setMensaje({ tipo: "err", texto: r.error });
      setResultados([]);
      return;
    }
    setResultados(r.alumnos);
    if (r.alumnos.length === 1) setCurpSel(r.alumnos[0]!.curp);
  }

  async function onRegistrarInscripcion(id: string) {
    if (!curpSel.trim() || !grupoSel) {
      setMensaje({ tipo: "err", texto: "Selecciona un alumno (CURP) y un grupo." });
      return;
    }
    const r = await actionInscribirAlumnoEnCiclo({ curp: curpSel, grupoId: grupoSel, periodoId: id });
    avisarRes(r);
    if (r.ok) {
      setResultados([]);
      setCurpSel("");
      await cargarDetalle(id);
    }
  }

  function agregarParcial(periodoId: string) {
    const existentes = ciclos.find((c) => c.periodo.id === periodoId)?.evaluaciones ?? [];
    const siguiente = (existentes.reduce((m, e) => Math.max(m, e.numero), 0) ?? 0) + 1;
    const key = `nuevo-${periodoId}-${Date.now()}`;
    setDraftsEval((prev) => ({
      ...prev,
      [key]: {
        key,
        periodoId,
        numero: String(siguiente),
        nombre: `Parcial ${siguiente}`,
        inicio: "",
        fin: "",
        activo: true,
      },
    }));
  }

  function setDraft(key: string, patch: Partial<EvalDraft>) {
    setDraftsEval((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key]!, ...patch } } : prev));
  }

  async function onGuardarParcial(d: EvalDraft) {
    const r = await actionGuardarEvaluacion({
      id: d.id,
      periodoId: d.periodoId,
      numero: d.numero,
      nombre: d.nombre,
      fechaInicio: d.inicio,
      fechaFin: d.fin,
      activo: d.activo,
    });
    avisarRes(r);
    if (r.ok) await recargar();
  }

  async function onToggleParcial(ev: { id: string; periodoId: string; activo: boolean }) {
    const r = await actionSetActivoEvaluacion(ev.periodoId, ev.id, !ev.activo);
    avisarRes(r);
    if (r.ok) await recargar();
  }

  const inputCls =
    "rounded-xl border border-white/70 bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800 outline-none";
  const accionCls =
    "rounded-full border border-white/70 bg-linear-to-b from-sky-500 via-sky-600 to-sky-700 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white transition hover:brightness-105 disabled:opacity-50";

  return (
    <section
      className="relative mt-6 overflow-hidden rounded-[2rem] border-[3px] border-indigo-800/50 bg-indigo-100/35 p-3 shadow-[0_12px_40px_rgba(129,140,248,0.15)] backdrop-blur-xl backdrop-saturate-150 sm:p-4"
      aria-label="Ciclo escolar y periodos de evaluación"
    >
      <div className="relative z-[1] flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-sm font-extrabold uppercase tracking-wide text-indigo-900">
            Ciclo escolar y periodos de evaluación
          </h2>
          <span className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white">
            Fecha → ciclo → parcial
          </span>
        </div>

        {mensaje && (
          <p
            className={`rounded-2xl px-4 py-2 text-xs font-bold ${
              mensaje.tipo === "ok"
                ? "bg-emerald-100 text-emerald-900"
                : "bg-red-100 text-red-800"
            }`}
            role="status"
          >
            {mensaje.texto}
          </p>
        )}

        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
            Crear ciclo escolar
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              className={inputCls}
              placeholder="Ciclo (ej. 2027-2028)"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
            />
            <input
              type="date"
              className={inputCls}
              value={nuevoInicio}
              onChange={(e) => setNuevoInicio(e.target.value)}
            />
            <input
              type="date"
              className={inputCls}
              value={nuevoFin}
              onChange={(e) => setNuevoFin(e.target.value)}
            />
            <button
              type="button"
              className={accionCls}
              onClick={() => void onCreateCiclo()}
              disabled={!nuevoNombre.trim()}
            >
              Crear ciclo
            </button>
          </div>
        </div>

        {cargando ? (
          <p className="text-xs font-semibold text-slate-600">Cargando…</p>
        ) : ciclos.length === 0 ? (
          <p className="text-xs font-semibold text-slate-600">
            No hay ciclos registrados.
          </p>
        ) : (
          ciclos.map((item) => {
            const c = item.periodo;
            const draftC = draftsCiclo[c.id] ?? { inicio: "", fin: "" };
            const evalRows = item.evaluaciones
              .map((ev) => draftsEval[ev.id] ?? null)
              .filter((d): d is EvalDraft => Boolean(d));
            const nuevas = Object.values(draftsEval).filter(
              (d) => d.periodoId === c.id && !d.id,
            );
            return (
              <div
                key={c.id}
                className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-extrabold uppercase tracking-wide text-indigo-900">
                    {c.nombre}{" "}
                    <span
                      className={`ml-2 rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${
                        estadoVisible(c.id).clase
                      }`}
                    >
                      {estadoVisible(c.id).etiqueta}
                    </span>
                    {!adminById[c.id]?.esquema && !c.activo && (
                      <span className="ml-2 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[9px] font-bold text-orange-800">
                        esquema F1 pendiente (aplicar SQL)
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-1">
                    <button type="button" className={accionCls} onClick={() => alternarDetalle(c.id)}>
                      {detalleOpen[c.id]
                        ? "Cerrar estado"
                        : c.activo
                          ? "Estado / Administrar"
                          : "Continuar configuración"}
                    </button>
                    {c.activo ? (
                      <button
                        type="button"
                        className={`${accionCls} !from-rose-500 !via-rose-600 !to-rose-700`}
                        onClick={() => void onDesactivarCiclo(c.id)}
                      >
                        Desactivar (histórico)
                      </button>
                    ) : adminById[c.id]?.esquema && adminById[c.id]?.estado === "historico" ? null : (
                      <button type="button" className={accionCls} onClick={() => void onActivarCiclo(c.id)}>
                        Activar ciclo
                      </button>
                    )}
                  </div>
                </div>
                {detalleOpen[c.id] && (
                  <div className="mt-3 rounded-2xl border border-indigo-200 bg-white/70 p-3">
                    {detalle[c.id] === "cargando" ? (
                      <p className="text-[11px] font-semibold text-slate-600">Validando integridad…</p>
                    ) : detalle[c.id] ? (
                      (() => {
                        const dd = detalle[c.id] as DetalleCicloAdmin;
                        const historico =
                          adminById[c.id]?.esquema && adminById[c.id]?.estado === "historico";
                        return (
                          <div className="flex flex-col gap-2">
                            <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                              <span className="rounded-xl bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600">
                                Grupos: {dd.conteos.grupos}
                              </span>
                              <span className="rounded-xl bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600">
                                Materias activas: {dd.conteos.materiasActivas}
                              </span>
                              <span className="rounded-xl bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600">
                                Inscritos activos: {dd.conteos.inscripcionesActivas}
                              </span>
                              <span className="rounded-xl bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600">
                                Parciales: {dd.conteos.parciales}
                              </span>
                              <span className="rounded-xl bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600">
                                Días clase: {dd.conteos.diasClase}
                              </span>
                              <span
                                className={`rounded-xl px-2 py-1 text-[10px] font-extrabold uppercase ${
                                  dd.ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
                                }`}
                              >
                                {dd.ok ? "Puede activarse" : "NO puede activarse"}
                              </span>
                            </div>
                            {!dd.ok && (
                              <div className="rounded-xl bg-red-50 p-2">
                                <p className="text-[10px] font-extrabold uppercase tracking-wide text-red-700">
                                  Bloqueantes
                                </p>
                                <ul className="mt-1 list-inside list-disc text-[11px] font-semibold text-red-800">
                                  {dd.errores.map((e) => (
                                    <li key={e.codigo}>{e.mensaje}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {dd.advertencias.length > 0 && (
                              <div className="rounded-xl bg-amber-50 p-2">
                                <p className="text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
                                  Advertencias
                                </p>
                                <ul className="mt-1 list-inside list-disc text-[11px] font-semibold text-amber-800">
                                  {dd.advertencias.map((e) => (
                                    <li key={e.codigo}>{e.mensaje}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-2">
                              <button type="button" className={accionCls} onClick={() => void cargarDetalle(c.id)}>
                                Validar nuevamente
                              </button>
                              {!c.activo && !historico && (
                                <button
                                  type="button"
                                  className={accionCls}
                                  disabled={!dd.ok}
                                  onClick={() => void onActivarCiclo(c.id)}
                                >
                                  {dd.ok ? "Activar ciclo (OPERATIVO)" : "Activar bloqueado"}
                                </button>
                              )}
                              {historico && (
                                <span className="text-[10px] font-bold uppercase text-slate-500">
                                  Solo consulta (histórico)
                                </span>
                              )}
                            </div>
                            <div className="rounded-xl border border-sky-200 bg-sky-50 p-2">
                              <p className="text-[10px] font-extrabold uppercase tracking-wide text-sky-800">
                                Registrar alumnos (preparación académica)
                              </p>
                              {historico ? (
                                <p className="mt-1 text-[10px] font-semibold text-slate-500">
                                  Ciclo histórico: solo consulta.
                                </p>
                              ) : (
                                <div className="mt-2 flex flex-col gap-2">
                                  <div className="flex flex-wrap items-center gap-1">
                                    <input
                                      className={`${inputCls} min-w-[10rem] flex-1`}
                                      placeholder="Buscar CURP o nombre del alumno"
                                      value={busqueda}
                                      onChange={(e) => setBusqueda(e.target.value)}
                                    />
                                    <button
                                      type="button"
                                      className={accionCls}
                                      onClick={() => void onBuscarAlumnos()}
                                    >
                                      Buscar
                                    </button>
                                  </div>
                                  {resultados.length > 0 && (
                                    <div className="flex max-h-28 flex-col gap-1 overflow-y-auto rounded-xl bg-white/80 p-1">
                                      {resultados.map((a) => (
                                        <button
                                          key={a.curp}
                                          type="button"
                                          className={`rounded-lg px-2 py-1 text-left text-[10px] font-semibold ${
                                            curpSel === a.curp
                                              ? "bg-sky-200 text-sky-900"
                                              : "bg-white text-slate-700 hover:bg-sky-100"
                                          }`}
                                          onClick={() => setCurpSel(a.curp)}
                                        >
                                          {a.curp} — {a.nombre}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  {curpSel && (
                                    <p className="text-[10px] font-bold text-slate-700">
                                      CURP seleccionada: {curpSel}
                                    </p>
                                  )}
                                  <select
                                    className={inputCls}
                                    value={grupoSel}
                                    onChange={(e) => setGrupoSel(e.target.value)}
                                  >
                                    <option value="">Grupo destino…</option>
                                    {gruposCiclo[c.id] !== "cargando" &&
                                      Array.isArray(gruposCiclo[c.id]) &&
                                      (gruposCiclo[c.id] as Array<{
                                        id: string;
                                        grado: string;
                                        grupo: string;
                                        carreraClave: string;
                                      }>).map((g) => (
                                        <option key={g.id} value={g.id}>
                                          {g.grado} {g.grupo}
                                          {g.carreraClave ? ` · ${g.carreraClave}` : " · sin carrera"}
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                    type="button"
                                    className={`${accionCls} !from-emerald-500 !via-emerald-600 !to-emerald-700`}
                                    disabled={!curpSel || !grupoSel}
                                    onClick={() => void onRegistrarInscripcion(c.id)}
                                  >
                                    Registrar inscripción
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })()
                    ) : null}
                  </div>
                )}
                <p className="mt-1 text-[10px] font-semibold text-slate-600">
                  Rango del ciclo (opcional)
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    className={inputCls}
                    value={draftC.inicio}
                    onChange={(e) =>
                      setDraftsCiclo((prev) => ({
                        ...prev,
                        [c.id]: { ...draftC, inicio: e.target.value },
                      }))
                    }
                  />
                  <input
                    type="date"
                    className={inputCls}
                    value={draftC.fin}
                    onChange={(e) =>
                      setDraftsCiclo((prev) => ({
                        ...prev,
                        [c.id]: { ...draftC, fin: e.target.value },
                      }))
                    }
                  />
                  <button
                    type="button"
                    className={accionCls}
                    onClick={() => void onGuardarRango(c.id)}
                  >
                    Guardar rango
                  </button>
                </div>
                <p className="mt-4 text-[10px] font-extrabold uppercase tracking-wide text-indigo-900">
                  Periodos de evaluación (parciales)
                </p>
                {evalRows.length === 0 && nuevas.length === 0 && (
                  <p className="mt-1 text-[11px] font-semibold text-slate-600">
                    Sin parciales configurados.
                  </p>
                )}
                <div className="mt-2 flex flex-col gap-2">
                  {[...evalRows, ...nuevas].map((d) => (
                    <div
                      key={d.key}
                      className="grid grid-cols-1 gap-2 rounded-2xl border border-white/60 bg-white/60 p-2 sm:grid-cols-[4rem_1fr_1fr_1fr_auto]"
                    >
                      <input
                        type="number"
                        min={1}
                        className={inputCls}
                        value={d.numero}
                        onChange={(e) => setDraft(d.key, { numero: e.target.value })}
                      />
                      <input
                        className={inputCls}
                        value={d.nombre}
                        onChange={(e) => setDraft(d.key, { nombre: e.target.value })}
                        placeholder="Nombre (ej. Parcial 1)"
                      />
                      <input
                        type="date"
                        className={inputCls}
                        value={d.inicio}
                        onChange={(e) => setDraft(d.key, { inicio: e.target.value })}
                      />
                      <input
                        type="date"
                        className={inputCls}
                        value={d.fin}
                        onChange={(e) => setDraft(d.key, { fin: e.target.value })}
                      />
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          type="button"
                          className={accionCls}
                          onClick={() => void onGuardarParcial(d)}
                        >
                          Guardar
                        </button>
                        {d.id && (
                          <button
                            type="button"
                            className={accionCls}
                            onClick={() =>
                              void onToggleParcial({
                                id: d.id!,
                                periodoId: d.periodoId,
                                activo: d.activo,
                              })
                            }
                          >
                            {d.activo ? "Desactivar" : "Activar"}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className={`${accionCls} mt-3`}
                  onClick={() => agregarParcial(c.id)}
                >
                  + Agregar parcial
                </button>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
