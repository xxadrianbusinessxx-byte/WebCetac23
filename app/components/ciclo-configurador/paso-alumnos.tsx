"use client";

/**
 * F3 — Paso 3 · Alumnos e inscripciones del periodo.
 *
 * Dos flujos:
 *  1) MANUAL (búsqueda CURP/nombre → grupo del periodo → inscribirAlumnoEnCiclo).
 *  2) MASIVO CSV/Excel del período: seleccionar archivo → preview SERVER-SIDE
 *     (solo lectura) → resumen → confirmación explícita → apply SERVER-SIDE →
 *     refresh del listado de inscripciones del periodo (verificación B).
 *
 * El cliente NO parsea CSV, NO resuelve grupos/período y NO escribe Supabase:
 * consume las Server Actions existentes (actionPrevisualizarCargaAcademica /
 * actionAplicarCargaAcademica) enviando `periodoId` (ruta F3). La resolución de
 * grupos se hace en el servidor contra `grupos.periodo_id = periodoId`; la
 * inscripción se aplica con `inscribirAlumnoEnCiclo` (BORRADOR → activo=false)
 * y NUNCA toca inscripciones de otro período.
 */
import { useCallback, useEffect, useState } from "react";
import {
  actionBuscarAlumnosInscripcion,
  actionInscribirAlumnoEnCiclo,
  actionListarGruposPeriodo,
  actionListarInscripcionesPeriodo,
} from "@/app/actions/inscripciones-admin";
import {
  actionAplicarCargaAcademica,
  actionPrevisualizarCargaAcademica,
} from "@/app/actions/carga-academica";
import type {
  PreviewCargaAcademica,
  ResultadoAplicarCarga,
} from "@/lib/escolar/catalogo/carga-academica";
import type { InscripcionAdminCiclo } from "@/lib/escolar/catalogo/inscripciones-borrador";

const input = "rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-xs font-semibold text-[var(--oc-muted)]";
const btn = "rounded-full bg-[var(--oc-input)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] disabled:opacity-50";
const btnSec = "rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] disabled:opacity-50";

type Grupo = { id: string; grado: string; grupo: string; carreraClave: string };

function textoGrupo(g: Grupo | undefined): string {
  if (!g) return "";
  return `${g.grado} ${g.grupo}${g.carreraClave ? ` · ${g.carreraClave}` : " · sin carrera"}`;
}

export function PasoAlumnos({ periodoId, avisar }: {
  periodoId: string;
  avisar: (ok: boolean, x: string) => void;
}) {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [res, setRes] = useState<Array<{ curp: string; nombre: string }>>([]);
  const [curp, setCurp] = useState("");
  const [grupoId, setGrupoId] = useState("");
  const [err, setErr] = useState("");

  // Flujo masivo (ruta F3 con periodoId).
  const [archivo, setArchivo] = useState<File | null>(null);
  const [archivoNombre, setArchivoNombre] = useState("");
  const [grupoCsv, setGrupoCsv] = useState("");
  const [preview, setPreview] = useState<PreviewCargaAcademica | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [resultado, setResultado] = useState<ResultadoAplicarCarga | null>(null);
  const [cargandoPreview, setCargandoPreview] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [msgCsv, setMsgCsv] = useState<{ t: "ok" | "err"; x: string } | null>(null);

  // Listado de inscripciones del periodo (refresh / verificación B).
  const [inscripciones, setInscripciones] = useState<InscripcionAdminCiclo[]>([]);
  const [cargandoIns, setCargandoIns] = useState(false);
  const [insErr, setInsErr] = useState("");

  const cargarInscripciones = useCallback(async () => {
    setCargandoIns(true);
    setInsErr("");
    const r = await actionListarInscripcionesPeriodo(periodoId);
    setCargandoIns(false);
    if (r.ok) setInscripciones(r.inscripciones);
    else setInsErr(r.error);
  }, [periodoId]);

  // Carga inicial de grupos e inscripciones (sin setState síncrono en el efecto).
  useEffect(() => {
    let activo = true;
    void actionListarGruposPeriodo(periodoId).then((r) => {
      if (activo && r.ok) setGrupos(r.grupos);
    });
    void actionListarInscripcionesPeriodo(periodoId).then((r) => {
      if (!activo) return;
      if (r.ok) setInscripciones(r.inscripciones);
      else setInsErr(r.error);
    });
    return () => { activo = false; };
  }, [periodoId]);

  async function buscar() {
    const r = await actionBuscarAlumnosInscripcion(busqueda);
    if (!r.ok) { setErr(r.error); setRes([]); return; }
    setErr("");
    setRes(r.alumnos);
    if (r.alumnos.length === 1) setCurp(r.alumnos[0]!.curp);
  }

  async function inscribirManual() {
    if (!curp || !grupoId) { setErr("Selecciona alumno y grupo."); return; }
    const r = await actionInscribirAlumnoEnCiclo({ curp, grupoId, periodoId });
    avisar(r.ok, r.ok ? (r.mensaje ?? "Inscripción registrada.") : (r.error ?? "Error"));
    if (r.ok) {
      setRes([]); setCurp(""); setErr("");
      await cargarInscripciones();
    }
  }

  function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null;
    e.target.value = "";
    setArchivo(f);
    setArchivoNombre(f ? f.name : "");
    setPreview(null);
    setConfirmado(false);
    setResultado(null);
    setMsgCsv(null);
  }

  /** FormData para las Server Actions de carga: archivo + periodoId (destino)
   *  + grupo por defecto (contexto) solo si el CSV no trae grado/grupo. */
  function construirFormData(): FormData | null {
    if (!archivo) return null;
    const fd = new FormData();
    fd.set("archivo", archivo);
    fd.set("periodoId", periodoId);
    const g = grupos.find((x) => x.id === grupoCsv);
    if (g) {
      fd.set("grado", g.grado);
      fd.set("grupo", g.grupo);
      if (g.carreraClave) fd.set("carrera", g.carreraClave);
    }
    return fd;
  }

  async function previsualizar() {
    const fd = construirFormData();
    if (!fd) { setMsgCsv({ t: "err", x: "Selecciona un archivo CSV/Excel." }); return; }
    setCargandoPreview(true);
    setMsgCsv(null);
    setPreview(null);
    setConfirmado(false);
    setResultado(null);
    const r = await actionPrevisualizarCargaAcademica(fd);
    setCargandoPreview(false);
    setPreview(r);
    if (!r.ok) setMsgCsv({ t: "err", x: r.error ?? "No se pudo generar la preview." });
  }

  async function aplicar() {
    if (!preview?.ok || preview.bloqueaEscritura || !confirmado) return;
    const fd = construirFormData();
    if (!fd) return;
    setAplicando(true);
    setResultado(null);
    const r = await actionAplicarCargaAcademica(fd);
    setAplicando(false);
    setResultado(r);
    setConfirmado(false);
    setPreview(null);
    setMsgCsv(
      r.ok
        ? { t: "ok", x: "Carga aplicada. Se actualizó la lista de inscripciones del periodo." }
        : { t: "err", x: r.error ?? "No se pudo aplicar la carga." },
    );
    if (r.ok) await cargarInscripciones();
  }

  const grupoCsvSel = grupos.find((g) => g.id === grupoCsv);
  const totalInscritos = inscripciones.length;
  const activosEnPeriodo = inscripciones.filter((i) => i.activo).length;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
        Paso 3 · Alumnos e inscripciones del periodo
      </p>

      {/* Carga masiva CSV/Excel dirigida a ESTE periodo (F3) */}
      <div className="rounded-2xl border border-[var(--oc-ok)]/50 bg-[var(--oc-ok)]/15 p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-ok)]">
          Carga masiva de alumnos → este periodo
        </p>
        <p className="mt-1 text-[10px] font-semibold text-[var(--oc-ok)]/80">
          El servidor resuelve los grupos SOLO dentro de este periodo (periodoId).
          Una carga dirigida a B NUNCA modifica inscripciones de A (BORRADOR → activo=false).
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="file"
            accept=".csv,.xlsx,.xls,text/csv"
            onChange={onArchivo}
            className={`${input} flex-1 text-[10px]`}
          />
          <select
            className={input}
            value={grupoCsv}
            onChange={(e) => setGrupoCsv(e.target.value)}
            title="Grupo por defecto: se usa solo si el CSV no trae columnas GRADO/GRUPO/CARRERA."
          >
            <option value="">Grupo por defecto… (si el CSV no trae grado/grupo)</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>{textoGrupo(g)}</option>
            ))}
          </select>
        </div>
        {grupoCsvSel && (
          <p className="mt-1 text-[10px] font-bold text-[var(--oc-ok)]">
            Contexto: {textoGrupo(grupoCsvSel)} — las filas del CSV con GRADO/GRUPO/CARRERA tienen prioridad.
          </p>
        )}
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={!archivo || cargandoPreview} onClick={() => void previsualizar()}>
            {cargandoPreview ? "Previsualizando…" : "Previsualizar (solo lectura)"}
          </button>
          <button
            type="button"
            className={btnSec}
            disabled={!archivo}
            onClick={() => { setArchivo(null); setArchivoNombre(""); setPreview(null); setConfirmado(false); setResultado(null); setMsgCsv(null); }}
          >
            Quitar archivo
          </button>
        </div>
        {archivoNombre && (
          <p className="mt-1 text-[10px] font-semibold text-[var(--oc-muted)]">Archivo: {archivoNombre}</p>
        )}
        {msgCsv && (
          <p className={`mt-2 rounded-xl px-3 py-2 text-[10px] font-bold ${msgCsv.t === "ok" ? "bg-[var(--oc-ok)]/15 text-[var(--oc-ok)]" : "bg-[var(--oc-alert)]/15 text-[var(--oc-alert-text)]"}`}>
            {msgCsv.x}
          </p>
        )}
        {preview && !preview.ok && (
          <p className="mt-2 rounded-xl bg-[var(--oc-alert)]/15 px-3 py-2 text-[10px] font-bold text-[var(--oc-alert-text)]">
            {preview.error ?? "No se pudo previsualizar."}
          </p>
        )}
        {preview?.ok && (
          <div className="mt-2 rounded-xl border border-[var(--oc-ok)]/50 bg-[var(--oc-input)] p-2 text-[10px] font-semibold text-[var(--oc-muted)]">
            <p className="font-extrabold uppercase text-[var(--oc-ok)]">
              Resumen · ciclo destino: {preview.periodoUtilizado ?? "—"}
              {preview.bloqueaEscritura ? " · BLOQUEA escritura" : " · preview limpia"}
            </p>
            <p className="mt-1">
              Alumnos: {preview.alumnos.totalFilas} fila(s) · {preview.alumnos.curpsValidas} CURP válida(s) ·{" "}
              {preview.alumnos.curpsDuplicadas} duplicada(s) · {preview.alumnos.curpsAusentes} sin CURP ·{" "}
              {preview.alumnos.alumnosNuevos} nuevo(s).
            </p>
            <p>
              Inscripciones en este periodo: {preview.academico.nuevasInscripciones} nuevas ·{" "}
              {preview.academico.sinCambio} sin cambio · {preview.academico.cambiosDeGrupo} cambio(s) ·{" "}
              {preview.academico.gruposInexistentes} grupo(s) inexistente(s) ·{" "}
              {preview.academico.ambiguos} ambiguo(s) · {preview.academico.sinDatosAcademicos} sin datos académicos ·{" "}
              {preview.academico.conflictosAcademicos} conflicto(s).
            </p>
            {preview.bloqueaEscritura && (
              <p className="mt-1 font-extrabold text-[var(--oc-alert-text)]">
                La carga contiene grupos inexistentes/ambiguos o conflictos: NO se escribirá nada. Corrige el CSV o el grupo por defecto.
              </p>
            )}
            {!confirmado && (
              <button
                type="button"
                className={`${btn} mt-2`}
                disabled={preview.bloqueaEscritura}
                onClick={() => setConfirmado(true)}
              >
                Confirmar y aplicar la carga
              </button>
            )}
            {confirmado && (
              <>
                <p className="mt-2 font-extrabold text-[var(--oc-alert-text)]">
                  Confirmación explícita: se escribirá SOLO en inscripciones de este periodo (BORRADOR → activo=false).
                </p>
                <button
                  type="button"
                  className={`${btn} mt-1`}
                  disabled={aplicando}
                  onClick={() => void aplicar()}
                >
                  {aplicando ? "Aplicando…" : "Sí, aplicar carga en este periodo"}
                </button>
                <button type="button" className={`${btnSec} mt-1 ml-1`} onClick={() => setConfirmado(false)}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        )}
        {resultado && (
          <div className="mt-2 rounded-xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-2 text-[10px] font-semibold text-[var(--oc-text)]">
            {resultado.ok ? (
              <p>
                Apply OK · ALUMNOS: +{resultado.alumnos.agregados} agregados, {resultado.alumnos.yaExistentesSinCambios} sin cambios,
                {resultado.alumnos.completados} completados · Inscripciones: {resultado.inscripciones.nuevas} nuevas,
                {resultado.inscripciones.cambiosDeGrupo} cambios, {resultado.inscripciones.errores} errores.
              </p>
            ) : (
              <p className="font-extrabold text-[var(--oc-alert-text)]">{resultado.error}</p>
            )}
          </div>
        )}
      </div>
      {/* Inscripciones actuales del periodo (refresh / verificación B) */}
      <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
            Inscripciones en este periodo · {totalInscritos} fila(s)
            {activosEnPeriodo > 0 && ` · ${activosEnPeriodo} activa(s)`}
          </p>
          <button type="button" className={btnSec} disabled={cargandoIns} onClick={() => void cargarInscripciones()}>
            {cargandoIns ? "Cargando…" : "Refrescar"}
          </button>
        </div>
        {insErr && <p className="mt-1 text-[10px] font-bold text-[var(--oc-alert-text)]">{insErr}</p>}
        {inscripciones.length === 0 ? (
          <p className="mt-1 text-[10px] font-semibold text-[var(--oc-muted)]">
            Sin inscripciones registradas en este periodo todavía.
          </p>
        ) : (
          <div className="mt-1 max-h-40 overflow-y-auto rounded-xl bg-[var(--oc-input)] p-1">
            {inscripciones.map((i) => (
              <div key={i.id} className="flex items-center gap-2 border-b border-[var(--oc-border)] px-2 py-1 text-[10px] font-semibold text-[var(--oc-muted)] last:border-0">
                <span className="w-10 font-extrabold text-[var(--oc-text)]">{i.grado} {i.grupo}</span>
                {i.carreraClave && <span className="text-[var(--oc-muted)]">{i.carreraClave}</span>}
                <span className="flex-1 truncate">{i.curp} {i.nombreAlumno ? `— ${i.nombreAlumno}` : ""}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${i.activo ? "bg-[var(--oc-ok)]/15 text-[var(--oc-ok)]" : "bg-[var(--oc-alert)]/15 text-[var(--oc-alert-text)]"}`}>
                  {i.activo ? "activo" : "inactivo"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Inscripción individual */}
      <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-3">
        <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
          Alta individual (búsqueda global de alumnos)
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input className={`${input} min-w-[12rem] flex-1`} placeholder="Buscar CURP o nombre (padrón global ALUMNOS)" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <button type="button" className={btn} onClick={() => void buscar()}>Buscar</button>
        </div>
        {res.length > 0 && (
          <div className="mt-1 flex max-h-32 flex-col gap-1 overflow-y-auto rounded-xl bg-[var(--oc-input)] p-1">
            {res.map((a) => (
              <button key={a.curp} type="button"
                className={`rounded-lg px-2 py-1 text-left text-[10px] font-semibold ${curp === a.curp ? "bg-[var(--oc-surface)] text-[var(--oc-text)]" : "bg-[var(--oc-input)] text-[var(--oc-muted)] hover:bg-[var(--oc-surface)]"}`}
                onClick={() => setCurp(a.curp)}>
                {a.curp} — {a.nombre}
              </button>
            ))}
          </div>
        )}
        {curp && <p className="mt-1 text-[10px] font-bold text-[var(--oc-muted)]">CURP: {curp}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select className={input} value={grupoId} onChange={(e) => setGrupoId(e.target.value)}>
            <option value="">Grupo destino…</option>
            {grupos.map((g) => <option key={g.id} value={g.id}>{textoGrupo(g)}</option>)}
          </select>
          <button type="button" className={btn} disabled={!curp || !grupoId} onClick={() => void inscribirManual()}>
            Registrar inscripción en este periodo
          </button>
        </div>
        {err && <p className="mt-1 text-[10px] font-bold text-[var(--oc-alert-text)]">{err}</p>}
      </div>

      <p className="text-[10px] font-semibold text-[var(--oc-muted)]">
        BORRADOR → inscripción preparada (activo=false). OPERATIVO → activa. La importación masiva usa la carga académica con preview (periodoId).
      </p>

    </div>
  );
}
