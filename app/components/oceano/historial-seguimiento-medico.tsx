"use client";

/**
 * historial-seguimiento-medico.tsx — debajo de «Seguimiento médico»: quién
 * editó los datos de salud del alumno (padre o tutor, Administración escolar o
 * Dirección), cuándo, y qué cambió.
 *
 * Solo pinta: qué entra y cómo se lee lo decide `seguimiento-medico-puro.ts`, y
 * quién puede verlo, `actionListarHistorialSeguimientoMedico` en el servidor.
 * `version` cambia cada vez que el apartado guarda: es la señal para volver a
 * pedir la lista.
 */
import { useEffect, useState } from "react";
import { actionListarHistorialSeguimientoMedico } from "@/app/actions/seguimiento-medico";
import type { EntradaHistorialMedico } from "@/lib/escolar/alumno/seguimiento-medico-puro";

/** «2026-10-01» → «01/10/2026». Solo presentación. */
function fechaLegible(iso: string): string {
  const [a, m, d] = iso.split("-");
  return a && m && d ? `${d}/${m}/${a}` : iso;
}

export function HistorialSeguimientoMedico({
  curp,
  version,
}: {
  curp: string;
  version: number;
}) {
  // La respuesta se guarda CON la CURP a la que pertenece: al cambiar de alumno
  // no se pinta, ni un instante, el historial del anterior.
  const [estado, setEstado] = useState<{
    curp: string;
    entradas: EntradaHistorialMedico[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!curp) return;
    let activo = true;
    void actionListarHistorialSeguimientoMedico(curp)
      .then((r) => {
        if (!activo) return;
        setEstado(
          r.ok
            ? { curp, entradas: r.entradas, error: null }
            : { curp, entradas: [], error: r.error },
        );
      })
      .catch(() => {
        if (activo) setEstado({ curp, entradas: [], error: "No se pudo leer el historial." });
      });
    return () => {
      activo = false;
    };
  }, [curp, version]);

  const actual = estado && estado.curp === curp ? estado : null;

  return (
    <section className="flex flex-col gap-2">
      <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
        Historial de cambios
      </p>

      {!actual ? (
        <p className="text-xs font-semibold text-[var(--oc-muted)]">Consultando historial…</p>
      ) : actual.error ? (
        <p className="text-xs font-semibold text-[var(--oc-alert-text)]" role="alert">
          {actual.error}
        </p>
      ) : actual.entradas.length === 0 ? (
        <p className="text-xs font-semibold text-[var(--oc-muted)]">
          Sin ediciones registradas todavía.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {actual.entradas.map((e) => (
            <li
              key={e.id}
              className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2"
            >
              <p className="flex flex-wrap items-center gap-x-2 text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                <span>{e.fecha ? fechaLegible(e.fecha) : "Fecha desconocida"}</span>
                {e.hora && <span>· {e.hora}</span>}
                <span className="text-[var(--oc-text)]">· {e.quien}</span>
                {e.nombre && <span className="normal-case tracking-normal">· {e.nombre}</span>}
              </p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {e.cambios.map((c) => (
                  <li key={c.campo} className="text-xs font-semibold text-[var(--oc-text)]">
                    <span className="text-[var(--oc-muted)]">{c.etiqueta}:</span>{" "}
                    {c.antes ?? "—"} → {c.despues ?? "—"}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
