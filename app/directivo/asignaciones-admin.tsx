"use client";

// REACTIVADO en la UI de /configuracion por PROMPT C (R-5) y PROMPT D (R-4)
// (antes: DESACTIVADO, Bloque 17 de contexto.feliz).
/**
 * C4.12 — Panel de administración de asignaciones profesor → grupo_materia
 * (solo rol directivo; la autorización real se valida en las Server Actions).
 *
 * La identidad del profesor es SIEMPRE PROFESORES.ID; CLAVE solo aparece como
 * dato histórico informativo. El DDL de C4.11 debe estar aplicado; si no, las
 * acciones devuelven el error controlado de esquema pendiente.
 */
import { useEffect, useState } from "react";
import {
  actionCrearAsignacionProfesor,
  actionDesactivarAsignacionProfesor,
  actionListarAsignacionesProfesorAdmin,
  actionListarGruposMateriasParaAsignacion,
  actionListarProfesoresParaAsignacion,
  type GrupoMateriaParaAsignacion,
  type ProfesorParaAsignacion,
} from "@/app/actions/asignaciones-profesor";
import type { AsignacionAdminListado } from "@/lib/escolar/asignaciones-profesor";

export function AsignacionesProfesorAdmin() {
  const [profesores, setProfesores] = useState<ProfesorParaAsignacion[]>([]);
  const [oferta, setOferta] = useState<GrupoMateriaParaAsignacion[]>([]);
  const [asignaciones, setAsignaciones] = useState<AsignacionAdminListado[]>([]);
  const [profesorId, setProfesorId] = useState("");
  const [grupoMateriaId, setGrupoMateriaId] = useState("");
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState<{
    tipo: "ok" | "err";
    texto: string;
  } | null>(null);

  const recargar = async () => {
    setCargando(true);
    const [p, o, a] = await Promise.all([
      actionListarProfesoresParaAsignacion(),
      actionListarGruposMateriasParaAsignacion(),
      actionListarAsignacionesProfesorAdmin(),
    ]);
    if (Array.isArray(p)) {
      setProfesores(p);
    } else if ("error" in p) {
      setMensaje({ tipo: "err", texto: p.error });
    }
    if (Array.isArray(o)) {
      setOferta(o);
    } else if ("error" in o) {
      setMensaje({ tipo: "err", texto: o.error });
    }
    if ("ok" in a && a.ok) {
      setAsignaciones(a.asignaciones);
    } else if ("error" in a) {
      setMensaje({ tipo: "err", texto: a.error });
    }
    setCargando(false);
  };

  useEffect(() => {
    let activo = true;
    void (async () => {
      const [p, o, a] = await Promise.all([
        actionListarProfesoresParaAsignacion(),
        actionListarGruposMateriasParaAsignacion(),
        actionListarAsignacionesProfesorAdmin(),
      ]);
      if (!activo) return;
      if (Array.isArray(p)) {
        setProfesores(p);
      } else if ("error" in p) {
        setMensaje({ tipo: "err", texto: p.error });
      }
      if (Array.isArray(o)) {
        setOferta(o);
      } else if ("error" in o) {
        setMensaje({ tipo: "err", texto: o.error });
      }
      if ("ok" in a && a.ok) {
        setAsignaciones(a.asignaciones);
      } else if ("error" in a) {
        setMensaje({ tipo: "err", texto: a.error });
      }
      setCargando(false);
    })();
    return () => {
      activo = false;
    };
  }, []);

  const crear = async () => {
    const r = await actionCrearAsignacionProfesor({
      profesorId,
      grupoMateriaId,
    });
    setMensaje(
      r.ok
        ? { tipo: "ok", texto: r.mensaje }
        : { tipo: "err", texto: r.error },
    );
    await recargar();
  };

  const desactivar = async (id: string) => {
    const r = await actionDesactivarAsignacionProfesor(id);
    setMensaje(
      r.ok
        ? { tipo: "ok", texto: r.mensaje }
        : { tipo: "err", texto: r.error },
    );
    await recargar();
  };

  return (
    <div className="mt-10 w-full rounded-[1.5rem] border border-white/45 bg-slate-500/20 p-5 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm">
      <h2 className="text-sm font-extrabold uppercase tracking-wide text-slate-800">
        Asignaciones de profesor → grupo·materia (C4.12)
      </h2>
      <p className="mt-1 text-xs font-semibold text-slate-600">
        Identidad estructural: PROFESORES.ID. La CLAVE solo es dato histórico.
        El DDL de C4.11 debe estar aplicado en Supabase.
      </p>

      {mensaje && (
        <p
          className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${
            mensaje.tipo === "ok"
              ? "bg-emerald-500/15 text-emerald-800"
              : "bg-rose-500/15 text-rose-800"
          }`}
        >
          {mensaje.texto}
        </p>
      )}

      {cargando ? (
        <p className="mt-4 text-xs font-semibold text-slate-600">
          Cargando…
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
                Profesor (ID)
              </label>
              <select
                value={profesorId}
                onChange={(e) => setProfesorId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-xs font-bold text-slate-800"
              >
                <option value="">Seleccionar…</option>
                {profesores.map((p) => (
                  <option key={p.id} value={String(p.id)}>
                    {p.id} — {p.nombre} ({p.permisos}) · CLAVE {p.clave}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
                Grupo·materia
              </label>
              <select
                value={grupoMateriaId}
                onChange={(e) => setGrupoMateriaId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-xs font-bold text-slate-800"
              >
                <option value="">Seleccionar…</option>
                {oferta.map((g) => (
                  <option key={g.grupoMateriaId} value={g.grupoMateriaId}>
                    {g.descripcion} — {g.materiaNombre} · {g.periodoNombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void crear()}
            disabled={!profesorId || !grupoMateriaId}
            className="mt-4 rounded-full border border-white/70 bg-linear-to-b from-emerald-400 via-emerald-500 to-emerald-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35),0_3px_10px_rgba(2,6,23,0.12)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Crear asignación
          </button>

          <div className="mt-6">
            <h3 className="text-xs font-extrabold uppercase tracking-wide text-slate-700">
              Asignaciones existentes ({asignaciones.length})
            </h3>
            {asignaciones.length === 0 ? (
              <p className="mt-2 text-xs font-semibold text-slate-600">
                Sin asignaciones (asignaciones_profesor = 0). El fallback
                FALLBACK_TODAS_LAS_MATERIAS permanece activo.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-white/50 rounded-xl border border-white/60 bg-white/60">
                {asignaciones.map((a) => (
                  <li
                    key={a.asignacionId}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    title={a.tablaLegacy ?? undefined}
                  >
                    <div className="text-xs font-bold text-slate-800">
                      <span
                        className={`mr-2 rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase ${
                          a.activo
                            ? "bg-emerald-500/20 text-emerald-800"
                            : "bg-slate-400/30 text-slate-600"
                        }`}
                        title={
                          a.activo
                            ? undefined
                            : a.hasta
                              ? `Asignación desactivada el ${new Date(a.hasta).toLocaleString("es-MX")}`
                              : "Asignación inactiva"
                        }
                      >
                        {a.activo
                          ? "activa"
                          : `inactiva${a.hasta ? ` · ${new Date(a.hasta).toLocaleDateString("es-MX")}` : ""}`}
                      </span>
                      ID {a.profesorId} — {a.profesorNombre} →{" "}
                      {a.grupoDescripcion} / {a.materiaNombreVisible}
                      {a.carreraClave ? ` · ${a.carreraClave}` : ""} ·{" "}
                      {a.periodoNombre}
                      {!a.activo && a.hasta
                        ? ` — dejó de impartirla el ${new Date(a.hasta).toLocaleDateString("es-MX")}`
                        : ""}
                    </div>
                    {a.activo && (
                      <button
                        type="button"
                        onClick={() => void desactivar(a.asignacionId)}
                        className="rounded-full border border-white/70 bg-linear-to-b from-rose-400 via-rose-500 to-rose-600 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] transition hover:brightness-105"
                      >
                        Desactivar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

        </>
      )}
    </div>
  );
}
