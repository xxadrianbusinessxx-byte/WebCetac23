"use client";

/**
 * numero-control-alumno.tsx — el número de control (matrícula) en «Datos
 * personales». 2026-09-24.
 *
 * Lo ven todos los que ven la ficha. Lo EDITA solo quien tenga
 * `alumno.editar_numero_control`: el flag llega resuelto del servidor con la misma
 * `puede()` que la action, así que un botón visible nunca es uno que el servidor
 * rechace por permiso. El formato sí se puede rechazar (y el duplicado): el
 * mensaje de la action se enseña tal cual.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionGuardarNumeroControl } from "@/app/actions/administracion";

export function NumeroControlAlumno({
  curp,
  valor,
  puedeEditar,
}: {
  curp: string;
  valor: string | null;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [actual, setActual] = useState(valor);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(valor ?? "");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await actionGuardarNumeroControl({ curp, numeroControl: borrador });
      if (r.ok) {
        setActual(r.numeroControl);
        setEditando(false);
        // La constancia y el resto del expediente leen el número del servidor.
        router.refresh();
      } else {
        setMensaje(r.error);
      }
    } catch {
      setMensaje("No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="min-w-0">
      <p className="text-[10px] font-extrabold uppercase tracking-wide text-[var(--oc-muted)]">
        Número de control
      </p>
      {editando ? (
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            value={borrador}
            onChange={(e) => setBorrador(e.target.value)}
            placeholder="Ej. 23222040230009"
            aria-label="Número de control"
            maxLength={40}
            className="w-48 rounded-lg border border-[var(--oc-border)] bg-[var(--oc-input)] px-3 py-1.5 text-sm font-semibold text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
          />
          <button
            type="button"
            disabled={guardando}
            onClick={() => void guardar()}
            className="rounded-full bg-[var(--oc-mint)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--oc-mint-ink)] disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          <button
            type="button"
            disabled={guardando}
            onClick={() => {
              setEditando(false);
              setBorrador(actual ?? "");
              setMensaje(null);
            }}
            className="rounded-full border border-[var(--oc-border)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--oc-text)]"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-[var(--oc-text)]">{actual || "—"}</p>
          {puedeEditar && (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="rounded-full border border-[var(--oc-border)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110"
            >
              {actual ? "Editar" : "Capturar"}
            </button>
          )}
        </div>
      )}
      {mensaje && <p className="mt-1 text-[11px] font-semibold text-[var(--oc-alert-text)]">{mensaje}</p>}
    </div>
  );
}
