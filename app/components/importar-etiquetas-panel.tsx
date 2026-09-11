"use client";

/**
 * importar-etiquetas-panel.tsx — importación masiva de etiquetas personales.
 *
 * EXTRAÍDO de `app/configuracion/configuracion-client.tsx` (Fase 9). Vivía
 * escrito en línea dentro de esas 938 líneas, y por eso el shell Océano no
 * podía ofrecerlo: no había componente que montar. Ahora sí.
 *
 * La lógica NO cambió: mismo `actionImportarEtiquetasGlobal`, mismo FormData,
 * mismo resumen. Lo único que cambia es que vive por su cuenta y que su
 * envoltorio usa los tokens del tema oscuro.
 *
 * Regla que conserva del original: los errores por fila NO detienen el
 * archivo, y el resumen los enumera. Es lo que hace que una importación de
 * cientos de filas sirva de algo cuando tres vienen mal.
 */
import { useState } from "react";
import { actionImportarEtiquetasGlobal } from "@/app/actions/etiquetas-dinamicas";

type ResumenImportacionEtiquetas = {
  procesados: number;
  actualizados: number;
  omitidos: number;
  alumnosNoEncontrados: string[];
  errores: string[];
  duplicadosCurp: string[];
};

export function ImportarEtiquetasPanel() {
  const [archivo, setArchivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);
  const [resumen, setResumen] = useState<ResumenImportacionEtiquetas | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onImportar() {
    if (!archivo) {
      setError("Selecciona un archivo Excel.");
      return;
    }
    setImportando(true);
    setError(null);
    setResumen(null);
    const fd = new FormData();
    fd.set("archivo", archivo);
    const r = await actionImportarEtiquetasGlobal(fd);
    setImportando(false);
    if (!r.ok) {
      setError(r.error ?? "No se pudo importar el archivo.");
      return;
    }
    setResumen(r.resumen ?? null);
  }

  return (
    <section
      aria-label="Importar etiquetas personales en masa"
      className="flex flex-col gap-4 rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-extrabold uppercase tracking-wide text-[var(--oc-text)]">
          Importar etiquetas personales (masivo)
        </h2>
        <span className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
          Excel con CURP + columnas de etiquetas
        </span>
      </div>

      <p className="text-xs font-semibold text-[var(--oc-muted)]">
        Sube un archivo <span className="text-[var(--oc-text)]">Excel (.xlsx / .xls)</span> con una
        columna <span className="text-[var(--oc-text)]">CURP</span> y, en el resto de columnas, los
        títulos de etiquetas (ej. «Deporte», «Pasatiempo»). Cada fila reemplaza el conjunto de
        etiquetas de ese alumno. Los errores por fila no detienen el archivo.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="file"
          accept=".xlsx,.xls"
          aria-label="Seleccionar Excel de etiquetas"
          onChange={(e) => {
            setArchivo(e.target.files?.[0] ?? null);
            setError(null);
            setResumen(null);
          }}
          className="max-w-xs rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-2 text-xs font-semibold text-[var(--oc-text)] outline-none"
        />
        <button
          type="button"
          onClick={() => void onImportar()}
          disabled={importando || !archivo}
          className="rounded-full border border-[var(--oc-border)] bg-[var(--oc-input)] px-5 py-2 text-[11px] font-extrabold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {importando ? "Importando…" : "Importar etiquetas"}
        </button>
      </div>

      {error && (
        <p className="text-center text-xs font-semibold text-[var(--oc-alert-text)]" role="alert">
          {error}
        </p>
      )}

      {resumen && (
        <div className="rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] p-3">
          <p className="mb-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
            Resumen de la importación
          </p>
          <ul className="flex flex-col gap-1 text-xs font-semibold text-[var(--oc-text)]">
            <li>Alumnos procesados: {resumen.procesados}</li>
            <li>Actualizados: {resumen.actualizados}</li>
            <li>Omitidos: {resumen.omitidos}</li>
            {resumen.alumnosNoEncontrados.length > 0 && (
              <li className="text-[var(--oc-alert-text)]">
                No encontrados: {resumen.alumnosNoEncontrados.length} —{" "}
                {resumen.alumnosNoEncontrados.slice(0, 10).join(", ")}
                {resumen.alumnosNoEncontrados.length > 10 ? "…" : ""}
              </li>
            )}
            {resumen.duplicadosCurp.length > 0 && (
              <li className="text-[var(--oc-alert-text)]">
                CURP duplicadas en el archivo: {resumen.duplicadosCurp.length}
              </li>
            )}
            {resumen.errores.length > 0 && (
              <li className="text-[var(--oc-alert-text)]">Errores: {resumen.errores.length}</li>
            )}
          </ul>
          {resumen.errores.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
                Ver errores
              </summary>
              <ul className="mt-1 max-h-32 overflow-y-auto rounded-lg bg-[var(--oc-surface)] p-2 text-[11px] font-semibold text-[var(--oc-muted)]">
                {resumen.errores.slice(0, 40).map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
