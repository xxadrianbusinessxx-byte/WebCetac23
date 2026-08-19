"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  actionAsignarPermiso,
  actionCrearCarpeta,
  actionDescargarDocumento,
  actionEliminarCarpeta,
  actionEliminarDocumento,
  actionListarProfesoresPermisos,
  actionObtenerEstadoDocumentos,
  actionQuitarPermiso,
  actionRenombrarCarpeta,
  actionSubirDocumento,
  type EstadoDocumentos,
} from "@/app/actions/documentos";

import {
  rutaCarpeta,
  puedeEliminar,
  puedeSubir,
  puedeVer,
  type CarpetaRow,
  type DocumentoRow,
  type PermisoCarpetaRow,
} from "@/lib/escolar/documentos";
import { NIVELES_PERMISO, type NivelPermiso } from "@/lib/escolar/tables";

function PanelTab({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] sm:text-[11px] ${className}`}>
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

function formatearBytes(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function iconoDocumento(tipo: string | null): string {
  const t = (tipo ?? "").toLowerCase();
  if (t.includes("pdf")) return "📄";
  if (t.includes("word") || t.includes("doc")) return "📝";
  if (t.includes("excel") || t.includes("sheet") || t.includes("csv")) return "📊";
  if (t.includes("image") || t.includes("png") || t.includes("jpeg")) return "🖼️";
  return "📎";
}

const ETIQUETA_NIVEL: Record<NivelPermiso, string> = {
  ver: "Ver",
  subir: "Subir",
  eliminar: "Eliminar",
};

export function DocumentosPanel() {
  const [estado, setEstado] = useState<EstadoDocumentos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [carpetaActualId, setCarpetaActualId] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Crear carpeta
  const [nuevaCarpeta, setNuevaCarpeta] = useState("");
  const [creando, setCreando] = useState(false);

  // Subir archivo
  const [archivo, setArchivo] = useState<File | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const inputArchivoRef = useRef<HTMLInputElement>(null);

  // Permisos
  const [profesorPermiso, setProfesorPermiso] = useState("");
  const [nivelPermiso, setNivelPermiso] = useState<NivelPermiso>("ver");
  const [asignando, setAsignando] = useState(false);

  // FASE 3 — sub-vista de administración de permisos (solo directivo)
  const [vistaPermisos, setVistaPermisos] = useState(false);
  const [carpetaPermiso, setCarpetaPermiso] = useState("");


  const cargar = useCallback(async (carpetaId: string | null) => {
    setCargando(true);
    const res = await actionObtenerEstadoDocumentos(carpetaId);
    setEstado(res);
    setCarpetaActualId(carpetaId);
    setCargando(false);
  }, []);

  useEffect(() => {
    void cargar(null);
  }, [cargar]);

  const esDirectivo = estado?.esDirectivo ?? false;
  const nivelActual = estado?.nivelActual ?? null;
  const carpetas = estado?.carpetas ?? [];
  const documentos = estado?.documentos ?? [];
  const permisos = estado?.permisos ?? [];
  const profesores = estado?.profesores ?? [];

  const subcarpetas = carpetas.filter((c) => c.parent_id === carpetaActualId);
  const ruta = rutaCarpeta(carpetas, carpetaActualId);
  const permisosDeCarpeta = permisos.filter(
    (p) => p.carpeta_id === carpetaActualId,
  );

  const puedeSubirAqui = esDirectivo || puedeSubir(nivelActual);
  const puedeEliminarAqui = esDirectivo || puedeEliminar(nivelActual);
  const puedeVerAqui = esDirectivo || puedeVer(nivelActual);

  async function onCrearCarpeta() {
    if (!nuevaCarpeta.trim()) return;
    setCreando(true);
    setError(null);
    const res = await actionCrearCarpeta(nuevaCarpeta.trim(), carpetaActualId);
    setCreando(false);
    if (res.ok) {
      setNuevaCarpeta("");
      setMensaje("Carpeta creada.");
      await cargar(carpetaActualId);
    } else {
      setError(res.error);
    }
  }

  async function onSubir() {
    if (!archivo) {
      inputArchivoRef.current?.click();
      return;
    }
    if (!carpetaActualId) {
      setError("Selecciona una carpeta para subir el archivo.");
      return;
    }
    setSubiendo(true);
    setError(null);
    const fd = new FormData();
    fd.set("archivo", archivo);
    const res = await actionSubirDocumento(carpetaActualId, fd);
    setSubiendo(false);
    if (res.ok) {
      setArchivo(null);
      setMensaje(`«${archivo.name}» subido.`);
      await cargar(carpetaActualId);
    } else {
      setError(res.error);
    }
  }

  async function onDescargar(doc: DocumentoRow) {
    const res = await actionDescargarDocumento(doc.id);
    if (res.ok) {
      window.open(res.url, "_blank");
    } else {
      setError(res.error);
    }
  }

  async function onEliminarDocumento(doc: DocumentoRow) {
    if (!confirm(`¿Eliminar «${doc.nombre_original}»?`)) return;
    const res = await actionEliminarDocumento(doc.id);
    if (res.ok) {
      setMensaje("Documento eliminado.");
      await cargar(carpetaActualId);
    } else {
      setError(res.error);
    }
  }

  async function onEliminarCarpeta(carpeta: CarpetaRow) {
    if (
      !confirm(
        `¿Eliminar la carpeta «${carpeta.nombre}» y todo su contenido?`,
      )
    )
      return;
    const res = await actionEliminarCarpeta(carpeta.id);
    if (res.ok) {
      setMensaje("Carpeta eliminada.");
      await cargar(carpeta.parent_id);
    } else {
      setError(res.error);
    }
  }

  async function onAsignarPermiso() {
    if (!carpetaActualId || !profesorPermiso.trim()) return;
    setAsignando(true);
    setError(null);
    const res = await actionAsignarPermiso(
      carpetaActualId,
      profesorPermiso.trim(),
      nivelPermiso,
    );
    setAsignando(false);
    if (res.ok) {
      setProfesorPermiso("");
      setMensaje("Permiso asignado.");
      await cargar(carpetaActualId);
    } else {
      setError(res.error);
    }
  }

  async function onQuitarPermiso(permiso: PermisoCarpetaRow) {
    const res = await actionQuitarPermiso(permiso.id);
    if (res.ok) {
      setMensaje("Permiso retirado.");
      await cargar(carpetaActualId);
    } else {
      setError(res.error);
    }
  }

  // FASE 3 — otorgar acceso desde la sub-vista de permisos (usa carpetaPermiso).
  async function onOtorgarAcceso() {
    if (!carpetaPermiso || !profesorPermiso.trim()) {
      setError("Selecciona una carpeta y un profesor.");
      return;
    }
    setAsignando(true);
    setError(null);
    const res = await actionAsignarPermiso(
      carpetaPermiso,
      profesorPermiso.trim(),
      nivelPermiso,
    );
    setAsignando(false);
    if (res.ok) {
      setProfesorPermiso("");
      setMensaje("Acceso otorgado.");
      await cargar(carpetaActualId);
    } else {
      setError(res.error);
    }
  }

  // FASE 3 — recargar la lista de profesores asignables bajo demanda.
  const [recargandoProfesores, setRecargandoProfesores] = useState(false);
  async function onActualizarProfesores() {
    setRecargandoProfesores(true);
    setError(null);
    const res = await actionListarProfesoresPermisos();
    setRecargandoProfesores(false);
    if (res.ok) {
      setEstado((prev) => (prev ? { ...prev, profesores: res.profesores } : prev));
      setMensaje("Lista de profesores actualizada.");
    } else {
      setError(res.error);
    }
  }


  // Árbol de carpetas aplanado con indentación por profundidad (para el selector).
  const carpetasArbol = carpetas
    .map((c) => ({
      carpeta: c,
      profundidad: rutaCarpeta(carpetas, c.id).length - 1,
    }))
    .sort((a, b) => {
      const ra = rutaCarpeta(carpetas, a.carpeta.id)
        .map((x) => x.nombre)
        .join("/");
      const rb = rutaCarpeta(carpetas, b.carpeta.id)
        .map((x) => x.nombre)
        .join("/");
      return ra.localeCompare(rb);
    });

  // Accesos actuales agrupados por profesor (FASE 3).
  const accesosPorProfesor = new Map<string, PermisoCarpetaRow[]>();
  for (const p of permisos) {
    const lista = accesosPorProfesor.get(p.profesor) ?? [];
    lista.push(p);
    accesosPorProfesor.set(p.profesor, lista);
  }

  return (
    <div className="relative flex flex-1 flex-col gap-6 overflow-hidden rounded-[2rem] border-[3px] border-sky-800/50 bg-sky-100/35 p-3 shadow-[0_12px_40px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.9)] backdrop-blur-xl backdrop-saturate-150 sm:p-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        <PanelTab className="mx-auto w-fit">Documentos institucionales</PanelTab>
        {esDirectivo && (
          <GreyActionPill
            onClick={() => {
              setVistaPermisos((v) => !v);
              setError(null);
              setMensaje(null);
            }}
            className={vistaPermisos ? "ring-2 ring-sky-300/70" : ""}
          >
            {vistaPermisos ? "← Volver a archivos" : "🔐 Permisos"}
          </GreyActionPill>
        )}
      </div>

      <div className="relative z-[1] flex flex-col gap-4">
        {vistaPermisos && esDirectivo ? (
          /* ===== FASE 3 — Sub-vista de administración de permisos ===== */
          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                Otorgar acceso a una carpeta (se hereda a todo lo que cuelgue de ella)
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={profesorPermiso}
                  onChange={(e) => setProfesorPermiso(e.target.value)}
                  className="min-w-[10rem] flex-1 rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
                >
                  <option value="">Selecciona profesor…</option>
                  {profesores.length === 0 ? (
                    <option value="" disabled>
                      No hay profesores disponibles
                    </option>
                  ) : (
                    profesores.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))
                  )}
                </select>


                <select
                  value={carpetaPermiso}
                  onChange={(e) => setCarpetaPermiso(e.target.value)}
                  className="min-w-[12rem] flex-1 rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
                >
                  <option value="">Selecciona carpeta…</option>
                  {carpetasArbol.map(({ carpeta, profundidad }) => (
                    <option key={carpeta.id} value={carpeta.id}>
                      {"\u00A0".repeat(profundidad * 3)}📁 {carpeta.nombre}
                    </option>
                  ))}
                </select>
                <select
                  value={nivelPermiso}
                  onChange={(e) => setNivelPermiso(e.target.value as NivelPermiso)}
                  className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
                >
                  {NIVELES_PERMISO.map((n) => (
                    <option key={n} value={n}>
                      {n === "ver"
                        ? "Ver"
                        : n === "subir"
                          ? "Ver y subir"
                          : "Control total"}
                    </option>
                  ))}
                </select>
                <GreyActionPill onClick={onOtorgarAcceso} disabled={asignando}>
                  {asignando ? "Otorgando…" : "Otorgar acceso"}
                </GreyActionPill>
                <GreyActionPill
                  onClick={onActualizarProfesores}
                  disabled={recargandoProfesores}
                >
                  {recargandoProfesores ? "Actualizando…" : "Actualizar lista"}
                </GreyActionPill>
              </div>
            </div>


            <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
              <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
                Accesos actuales
              </p>
              {accesosPorProfesor.size === 0 ? (
                <p className="py-4 text-center text-sm font-semibold text-slate-600">
                  Aún no hay permisos otorgados.
                </p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {[...accesosPorProfesor.entries()].map(([profesor, lista]) => (
                    <li
                      key={profesor}
                      className="rounded-2xl border border-white/60 bg-white/50 px-3 py-2"
                    >
                      <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-sky-900">
                        {profesor}
                      </p>
                      <ul className="flex flex-col gap-1">
                        {lista.map((p) => {
                          const ruta = rutaCarpeta(carpetas, p.carpeta_id)
                            .map((c) => c.nombre)
                            .join(" › ");
                          return (
                            <li
                              key={p.id}
                              className="flex items-center justify-between gap-2 rounded-xl bg-sky-100/50 px-2 py-1"
                            >
                              <span className="min-w-0 text-xs font-semibold text-slate-700">
                                <span className="truncate">📁 {ruta || "Raíz"}</span>
                                <span className="ml-2 rounded-full bg-sky-200/70 px-2 py-0.5 text-[10px] font-extrabold uppercase text-sky-900">
                                  {ETIQUETA_NIVEL[p.nivel]}
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => onQuitarPermiso(p)}
                                className="shrink-0 rounded-full px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                              >
                                Revocar
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <>
        {/* Breadcrumb de navegación */}

        {/* Breadcrumb de navegación */}
        <div className="flex flex-wrap items-center gap-1 rounded-full border border-white/60 bg-white/55 px-3 py-2 text-[11px] font-bold text-sky-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.95)] backdrop-blur-sm">
          <button
            type="button"
            onClick={() => void cargar(null)}
            className="rounded-full px-2 py-1 hover:bg-sky-200/60"
          >
            📁 Raíz
          </button>
          {ruta.map((c) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="text-sky-400">›</span>
              <button
                type="button"
                onClick={() => void cargar(c.id)}
                className="rounded-full px-2 py-1 hover:bg-sky-200/60"
              >
                {c.nombre}
              </button>
            </span>
          ))}
        </div>

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

        {/* Crear carpeta (solo directivo) */}
        {esDirectivo && (
          <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
            <input
              type="text"
              value={nuevaCarpeta}
              onChange={(e) => setNuevaCarpeta(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onCrearCarpeta()}
              placeholder="Nombre de la nueva carpeta"
              className="min-w-[10rem] flex-1 rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white placeholder:text-white/75 shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
            />
            <GreyActionPill onClick={onCrearCarpeta} disabled={creando}>
              {creando ? "Creando…" : "Crear carpeta"}
            </GreyActionPill>
          </div>
        )}

        {/* Subir archivo */}
        {puedeSubirAqui && (
          <div className="flex flex-wrap items-center gap-2 rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
            <GreyActionPill onClick={onSubir} disabled={subiendo}>
              {subiendo
                ? "Subiendo…"
                : archivo
                  ? `Subir «${archivo.name}»`
                  : "Subir archivo"}
            </GreyActionPill>
            <input
              ref={inputArchivoRef}
              type="file"
              className="sr-only"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
              aria-label="Seleccionar archivo para subir"
            />
            <span className="text-[10px] font-semibold text-slate-600">
              PDF, Word, Excel, CSV, imágenes · máx. 20MB
            </span>
          </div>
        )}

        {/* Subcarpetas */}
        {subcarpetas.length > 0 && (
          <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
              Carpetas
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {subcarpetas.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/50 px-3 py-2"
                >
                  <button
                    type="button"
                    onClick={() => void cargar(c.id)}
                    className="flex min-w-0 items-center gap-2 text-left text-sm font-bold text-sky-900 hover:text-sky-700"
                  >
                    <span>📁</span>
                    <span className="truncate">{c.nombre}</span>
                  </button>
                  {esDirectivo && (
                    <button
                      type="button"
                      onClick={() => onEliminarCarpeta(c)}
                      className="rounded-full px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                      title="Eliminar carpeta"
                    >
                      🗑️
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Documentos */}
        <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
          <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
            Documentos
          </p>
          {!carpetaActualId ? (
            <p className="py-4 text-center text-sm font-semibold text-slate-600">
              Selecciona una carpeta para ver sus documentos.
            </p>
          ) : !puedeVerAqui ? (
            <p className="py-4 text-center text-sm font-semibold text-slate-600">
              No tienes permiso para ver esta carpeta.
            </p>
          ) : documentos.length === 0 ? (
            <p className="py-4 text-center text-sm font-semibold text-slate-600">
              Esta carpeta está vacía.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {documentos.map((doc) => (
                <li
                  key={doc.id}
                  className="flex items-center justify-between gap-2 rounded-2xl border border-white/60 bg-white/50 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="text-lg">{iconoDocumento(doc.tipo)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-sky-900">
                        {doc.nombre_original}
                      </p>
                      <p className="text-[10px] font-semibold text-slate-500">
                        {formatearBytes(doc.tamano_bytes)}
                        {doc.subido_por ? ` · ${doc.subido_por}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onDescargar(doc)}
                      className="rounded-full px-2 py-1 text-sm hover:bg-sky-200/60"
                      title="Descargar"
                    >
                      ⬇️
                    </button>
                    {puedeEliminarAqui && (
                      <button
                        type="button"
                        onClick={() => onEliminarDocumento(doc)}
                        className="rounded-full px-2 py-1 text-sm text-red-600 hover:bg-red-100"
                        title="Eliminar"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Gestión de permisos (solo directivo) */}
        {esDirectivo && carpetaActualId && (
          <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-3 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
            <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wide text-slate-600">
              Permisos de esta carpeta
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={profesorPermiso}
                onChange={(e) => setProfesorPermiso(e.target.value)}
                className="min-w-[10rem] flex-1 rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              >
                <option value="">Selecciona profesor…</option>
                {profesores.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <select
                value={nivelPermiso}
                onChange={(e) => setNivelPermiso(e.target.value as NivelPermiso)}
                className="rounded-full border border-white/70 bg-linear-to-b from-slate-400 via-slate-500 to-slate-600 px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide text-white shadow-[inset_0_2px_0_rgba(255,255,255,0.35)] outline-none focus:ring-2 focus:ring-sky-400/60"
              >
                {NIVELES_PERMISO.map((n) => (
                  <option key={n} value={n}>
                    {ETIQUETA_NIVEL[n]}
                  </option>
                ))}
              </select>
              <GreyActionPill onClick={onAsignarPermiso} disabled={asignando}>
                {asignando ? "Asignando…" : "Asignar"}
              </GreyActionPill>
            </div>

            {permisosDeCarpeta.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1">
                {permisosDeCarpeta.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/60 bg-white/50 px-3 py-1.5"
                  >
                    <span className="text-xs font-bold text-sky-900">
                      {p.profesor}
                      <span className="ml-2 rounded-full bg-sky-200/70 px-2 py-0.5 text-[10px] font-extrabold uppercase text-sky-900">
                        {ETIQUETA_NIVEL[p.nivel]}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onQuitarPermiso(p)}
                      className="rounded-full px-2 py-1 text-xs text-red-600 hover:bg-red-100"
                    >
                      Quitar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
          </>
        )}
      </div>
    </div>
  );
}


