"use client";

/**
 * comentario-personal-alumno.tsx — el «Comentario personal» del expediente.
 * 2026-11-17.
 *
 * Lo LEEN todos los que ven la ficha (incluido el propio alumno). Lo ESCRIBEN
 * el directivo, administración escolar y el tutor vinculado: el flag llega
 * resuelto del SERVIDOR (capacidad `alumno.editar_comentario_personal` +
 * `resolverAccesoAlumno`), así que un botón visible no es uno que la action
 * vaya a rechazar por permiso. Este componente no pregunta por el rol.
 *
 * Es UN texto que se sustituye, no un tablón que se acumula: el comentario
 * firmado del profesor es otro apartado (`alumno.comentar`). Por eso aquí hay
 * un borrador con Guardar/Cancelar y no un «enviar».
 *
 * Vaciarlo y guardar BORRA la nota, a propósito: ver `validarComentarioPersonal`.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { actionGuardarComentarioPersonal } from "@/app/actions/escolar";
import { COMENTARIO_MAX_LENGTH } from "@/lib/escolar/tables";

export function ComentarioPersonalAlumno({
  curp,
  valor,
  puedeEditar,
}: {
  curp: string;
  valor: string;
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const [actual, setActual] = useState(valor);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(valor);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    try {
      const r = await actionGuardarComentarioPersonal(curp, borrador);
      if (r.ok) {
        const limpio = borrador.trim();
        setActual(limpio);
        setBorrador(limpio);
        setEditando(false);
        // El expediente completo se lee del servidor (constancia incluida).
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

  const restantes = COMENTARIO_MAX_LENGTH - borrador.trim().length;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-[var(--oc-muted)]">
          Comentario personal
        </p>
        {puedeEditar && !editando && (
          <button
            type="button"
            onClick={() => setEditando(true)}
            className="rounded-full border border-[var(--oc-border)] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--oc-text)] transition hover:brightness-110"
          >
            {actual ? "Editar" : "Escribir"}
          </button>
        )}
      </div>

      {editando ? (
        <>
          <textarea
            rows={3}
            value={borrador}
            maxLength={COMENTARIO_MAX_LENGTH}
            onChange={(e) => setBorrador(e.target.value)}
            aria-label="Comentario personal"
            placeholder="Nota de contexto sobre el alumno."
            className="w-full resize-none rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-sm font-semibold text-[var(--oc-text)] outline-none focus:border-[var(--oc-border-active)]"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
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
                setBorrador(actual);
                setMensaje(null);
              }}
              className="rounded-full border border-[var(--oc-border)] px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-[var(--oc-text)]"
            >
              Cancelar
            </button>
            <span className="text-[10px] font-semibold text-[var(--oc-muted)]">
              {borrador.trim()
                ? `${restantes} caracteres restantes`
                : "Vacío: al guardar se borra la nota."}
            </span>
          </div>
        </>
      ) : (
        <textarea
          readOnly
          rows={3}
          value={actual}
          aria-label="Comentario personal"
          className="w-full resize-none rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-4 py-3 text-sm font-semibold text-[var(--oc-text)]"
        />
      )}

      {mensaje && (
        <p className="mt-1 text-[11px] font-semibold text-[var(--oc-alert-text)]">{mensaje}</p>
      )}
    </div>
  );
}
