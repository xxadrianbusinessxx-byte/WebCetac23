"use client";

/**
 * selector-archivo.tsx — EL selector de archivo del portal. 2026-11-17.
 *
 * Por qué existe. Había dos formas de pedir un archivo y no se parecían:
 *   · Calificaciones (`Materias › Calificaciones › Configuración`) pintaba una
 *     píldora «Elegir archivo» con el `input` escondido detrás.
 *   · Asistencias pintaba el `<input type="file">` **crudo**, con el botón que
 *     dibuja el sistema operativo: otro tamaño, otra tipografía, otro contraste
 *     y, en Windows, texto gris pequeño que no cumple el contraste del resto.
 * La misma tarea —subir una plantilla llena— se veía como dos cosas distintas.
 * Esta pieza es la única forma, y vive en `app/components/ui/` porque no tiene
 * dominio: no sabe de asistencias ni de calificaciones (ORDEN §1).
 *
 * Accesibilidad, que es el motivo del cambio:
 *   · El `input` va `sr-only`, NO `hidden`. `hidden` lo saca del árbol de
 *     accesibilidad y deja de ser enfocable: con teclado no se llegaba al
 *     control de calificaciones. Con `sr-only` sigue en el árbol, el lector de
 *     pantalla lo anuncia y el tabulador lo alcanza.
 *   · El foco se ve: `focus-within` dibuja el anillo en la píldora, porque el
 *     control enfocado es invisible por diseño y sin esto el foco se perdería.
 *   · El nombre del archivo elegido se anuncia (`role="status"`) y se enseña
 *     siempre: el `input` nativo lo mostraba por su cuenta y esconderlo sin
 *     reponerlo habría quitado la única señal de que la elección funcionó.
 *   · Deshabilitado se dice dos veces: al `input` (lo impone) y con
 *     `aria-disabled` en la píldora (lo cuenta).
 *
 * El `value = ""` tras elegir vive AQUÍ y no en cada pantalla: sin él, elegir
 * dos veces el mismo archivo no vuelve a disparar `change`, y quien corrige el
 * Excel y lo vuelve a elegir se queda con el de antes sin saberlo.
 */
import type { ReactNode } from "react";

export function SelectorArchivo({
  onArchivo,
  accept,
  disabled = false,
  etiqueta = "Elegir archivo",
  nombreArchivo = null,
  ayuda,
  etiquetaAccesible,
  className = "",
}: {
  /** Recibe el archivo elegido. El `input` ya quedó limpio para la próxima. */
  onArchivo: (archivo: File) => void;
  /** Extensiones admitidas, tal cual las espera el `accept` del input. */
  accept?: string;
  disabled?: boolean;
  /** Texto de la píldora. */
  etiqueta?: string;
  /** Nombre del archivo ya elegido, para decir qué se va a subir. */
  nombreArchivo?: string | null;
  /** Una línea de ayuda a la derecha (formatos, tamaño máximo…). */
  ayuda?: ReactNode;
  /** Para el lector de pantalla, cuando la píldora sola no basta. */
  etiquetaAccesible?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${className}`}>
      <label
        aria-disabled={disabled || undefined}
        className={`inline-flex w-fit items-center rounded-full border px-4 py-2 text-[11px] font-extrabold uppercase tracking-wide transition focus-within:ring-2 focus-within:ring-[var(--oc-border-active)] ${
          disabled
            ? "cursor-not-allowed border-[var(--oc-border)] bg-[var(--oc-input)] text-[var(--oc-muted)] opacity-60"
            : "cursor-pointer border-[var(--oc-border)] bg-[var(--oc-input)] text-[var(--oc-text)] hover:brightness-110"
        }`}
      >
        {etiqueta}
        <input
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          aria-label={etiquetaAccesible ?? etiqueta}
          onChange={(e) => {
            const elegido = e.target.files?.[0];
            // Se limpia SIEMPRE, también cuando no hay archivo (cancelar).
            e.target.value = "";
            if (elegido) onArchivo(elegido);
          }}
        />
      </label>

      <span
        role="status"
        className={`min-w-0 break-all text-[11px] font-semibold ${
          nombreArchivo ? "text-[var(--oc-text)]" : "text-[var(--oc-muted)]"
        }`}
      >
        {nombreArchivo ?? "Ningún archivo elegido"}
      </span>

      {ayuda && (
        <span className="text-[10px] font-semibold text-[var(--oc-muted)]">{ayuda}</span>
      )}
    </div>
  );
}
