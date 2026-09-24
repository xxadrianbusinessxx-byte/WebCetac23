"use client";

/**
 * buscador-expediente-oceano.tsx — el buscador de alumno de Administración escolar
 * (2026-09-24). Es el hermano del selector del tutor (`selector-alumno-oceano`):
 * va en el mismo sitio del sidebar y fija DE QUIÉN son los datos de las pestañas
 * «Alumnos» y «Trámites escolares».
 *
 * La diferencia es de alcance: el tutor elige entre SUS vinculados, una lista
 * corta que llega hecha; este rol puede abrir a cualquier alumno, así que se
 * busca por nombre o CURP. La búsqueda la resuelve el servidor
 * (`actionBuscarAlumnosExpediente`, con su capacidad). Elegir es una navegación:
 * el alumno queda en la URL y el servidor trae su expediente.
 */
import { useEffect, useState } from "react";
import { actionBuscarAlumnosExpediente } from "@/app/actions/administracion";

type AlumnoEncontrado = { curp: string; nombre: string };

export function BuscadorExpedienteOceano({
  seleccionado,
  onSeleccionar,
}: {
  /** El alumno cuyo expediente está abierto, o null. */
  seleccionado: AlumnoEncontrado | null;
  onSeleccionar: (curp: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [resultados, setResultados] = useState<AlumnoEncontrado[]>([]);
  const [estado, setEstado] = useState<"quieto" | "buscando" | "error">("quieto");

  // Espera 300 ms desde la última tecla: una búsqueda por pulsación saturaría
  // al servidor para una lista que el usuario todavía está escribiendo.
  useEffect(() => {
    const t = texto.trim();
    if (t.length < 3) {
      const limpiar = window.setTimeout(() => {
        setResultados([]);
        setEstado("quieto");
      }, 0);
      return () => window.clearTimeout(limpiar);
    }
    let vigente = true;
    const espera = window.setTimeout(() => {
      setEstado("buscando");
      actionBuscarAlumnosExpediente(t)
        .then((r) => {
          if (!vigente) return;
          if (r.ok) {
            setResultados(r.alumnos);
            setEstado("quieto");
          } else {
            setResultados([]);
            setEstado("error");
          }
        })
        .catch(() => {
          if (vigente) setEstado("error");
        });
    }, 300);
    return () => {
      vigente = false;
      window.clearTimeout(espera);
    };
  }, [texto]);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
        Alumno
      </p>

      {seleccionado ? (
        <div className="rounded-xl border border-[var(--oc-border-active)] bg-[var(--oc-input)] px-3 py-2">
          <p className="truncate text-xs font-semibold text-[var(--oc-text)]">
            {seleccionado.nombre || seleccionado.curp}
          </p>
          <p className="truncate text-[10px] font-semibold text-[var(--oc-muted)]">{seleccionado.curp}</p>
        </div>
      ) : (
        <p className="rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-[11px] font-semibold text-[var(--oc-muted)]">
          Ningún alumno abierto.
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="sr-only">Buscar alumno por nombre o CURP</span>
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar por nombre o CURP"
          className="w-full rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-xs font-semibold text-[var(--oc-text)] placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]"
        />
      </label>

      {estado === "buscando" && <p className="px-1 text-[11px] text-[var(--oc-muted)]">Buscando…</p>}
      {estado === "error" && (
        <p className="px-1 text-[11px] text-[var(--oc-alert-text)]">No se pudo buscar. Inténtalo de nuevo.</p>
      )}
      {estado === "quieto" && texto.trim().length >= 3 && resultados.length === 0 && (
        <p className="px-1 text-[11px] text-[var(--oc-muted)]">Sin coincidencias.</p>
      )}

      {resultados.length > 0 && (
        <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
          {resultados.map((a) => (
            <li key={a.curp}>
              <button
                type="button"
                onClick={() => {
                  onSeleccionar(a.curp);
                  setTexto("");
                }}
                className="w-full rounded-lg px-3 py-1.5 text-left transition hover:bg-[var(--oc-input)]"
              >
                <span className="block truncate text-xs font-semibold text-[var(--oc-text)]">{a.nombre || a.curp}</span>
                <span className="block truncate text-[10px] text-[var(--oc-muted)]">{a.curp}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
