"use client";

/**
 * constancia-por-curp-panel.tsx — Dirección › Administración escolar › Recursos
 * administrativos (2026-09-25).
 *
 * Dirección NO acepta solicitudes: eso es solo de Administración escolar. Lo que
 * hace es sacar la constancia DIRECTAMENTE: escribe la CURP del alumno y obtiene
 * la hoja oficial, lista para imprimir. Los datos los arma el servidor
 * (`actionDatosConstanciaPorCurp`, con `constancia.emitir`); la hoja es la MISMA
 * que usa Administración escolar.
 *
 * El número de control lo captura Administración escolar. Si al alumno le falta,
 * la hoja lo dice y no deja imprimir.
 */
import { useState } from "react";
import { actionDatosConstanciaPorCurp } from "@/app/actions/administracion";
import { ConstanciaEstudiosVistaPrevia } from "@/app/components/constancia-estudios-vista-previa";
import type { DatosConstanciaSinFecha } from "@/lib/escolar/administracion/constancia";

export function ConstanciaPorCurpPanel() {
  const [curp, setCurp] = useState("");
  const [datos, setDatos] = useState<DatosConstanciaSinFecha | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function generar() {
    setCargando(true);
    setError(null);
    setDatos(null);
    try {
      const r = await actionDatosConstanciaPorCurp({ curp });
      if (r.ok) setDatos(r.datos);
      else setError(r.error);
    } catch {
      setError("No se pudo generar la constancia. Inténtalo de nuevo.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4">
        <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-[var(--oc-muted)]">
          Constancia de estudios
        </h3>
        <p className="mb-3 text-xs text-[var(--oc-muted)]">
          Escribe la CURP del alumno para generar su constancia. Las solicitudes que hacen alumnos y
          tutores las atiende Administración escolar.
        </p>
        <form
          className="flex flex-wrap gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void generar();
          }}
        >
          <input
            value={curp}
            onChange={(e) => setCurp(e.target.value.toUpperCase())}
            placeholder="CURP del alumno"
            aria-label="CURP del alumno"
            maxLength={18}
            className="min-w-[16rem] flex-1 rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-2 text-sm font-semibold uppercase tracking-wide text-[var(--oc-text)] placeholder:normal-case placeholder:tracking-normal placeholder:text-[var(--oc-muted)] outline-none focus:border-[var(--oc-border-active)]"
          />
          <button
            type="submit"
            disabled={cargando || curp.trim().length < 18}
            className="rounded-full bg-[var(--oc-mint)] px-4 py-2 text-xs font-bold uppercase tracking-wide text-[var(--oc-mint-ink)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {cargando ? "Buscando…" : "Generar"}
          </button>
        </form>
        {error && <p className="mt-3 text-xs font-semibold text-[var(--oc-alert-text)]">{error}</p>}
      </div>

      {datos && (
        <>
          {!datos.numeroControl && (
            <p className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-3 text-xs text-[var(--oc-muted)]">
              Este alumno no tiene número de control. Lo captura Administración escolar desde su expediente.
            </p>
          )}
          <ConstanciaEstudiosVistaPrevia key={datos.curp} datos={datos} />
        </>
      )}
    </div>
  );
}
