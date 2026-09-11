/**
 * sidebar-oceano.tsx — NIVEL 2 del shell Océano (sidebar contextual).
 *
 * Apartados de la pestaña activa. Tres cosas del diseño que NO son cosmética:
 *   · El rail está ANCLADO al borde izquierdo (x=0) y ocupa el alto: divide la
 *     pantalla en dos zonas. No es una tarjeta flotante dentro del contenido.
 *   · El GRUPO de apartados FLOTA VERTICALMENTE CENTRADO en el alto del rail
 *     (Fase 2 · PASO 0/E2). Se centra el grupo entero, no cada ítem.
 *   · El ítem activo lleva borde 1px claro (`--oc-border-active`) y va en
 *     PRIMERA POSICIÓN — el reordenado lo hace `ordenSidebar()` del mapa, no
 *     este componente.
 *   · El rail es plano: los ítems no llevan recuadro relleno. El único adorno
 *     es el borde de 1 px del activo (y el color del texto).
 *
 * Apartado APAGADO: se dibuja, no navega (botón `disabled`) y muestra el texto
 * exacto del mapa (`textoApagado`). Un apartado AUSENTE del mapa no llega aquí:
 * eso es «denegado por capacidad» y no se dibuja en absoluto.
 */
import type { Apartado } from "@/lib/navegacion/mapa-navegacion";
import { esNavegable, textoApagado } from "@/lib/navegacion/mapa-navegacion";

export function SidebarOceano({
  apartados,
  idActivo,
  onApartado,
  children,
}: {
  /** Ya ordenados: el activo en primera posición. */
  apartados: readonly Apartado[];
  idActivo: string | null;
  onApartado: (idApartado: string) => void;
  /** Fase 4 — bloque POR ENCIMA de los apartados (el selector de alumno del
   *  tutor). El sidebar no sabe qué es: solo lo coloca. */
  children?: React.ReactNode;
}) {
  if (apartados.length === 0) return null;

  return (
    <aside className="flex w-full shrink-0 flex-col border-b border-[var(--oc-border)] bg-[var(--oc-sidebar)] px-4 py-4 lg:w-64 lg:justify-center lg:border-b-0 lg:border-r lg:px-5 lg:py-8">
      {children ? <div className="mb-4">{children}</div> : null}
      <nav aria-label="Apartados de la pestaña">
        <ul className="flex flex-col gap-1.5">
          {apartados.map((a) => {
            // Una MAQUETA se abre igual que un apartado activo: la diferencia
            // es que no opera, y eso se dice dentro, no negándole la entrada.
            const activo = a.id === idActivo && esNavegable(a);
            const apagado = a.estado === "apagado";
            const esMaqueta = a.estado === "maqueta";
            const aviso = textoApagado(a);
            return (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={apagado}
                  aria-current={activo ? "true" : undefined}
                  onClick={() => onApartado(a.id)}
                  className={`w-full rounded-lg border px-4 py-3 text-left transition ${
                    activo
                      ? "border-[var(--oc-border-active)] text-[var(--oc-text)]"
                      : apagado
                        ? "cursor-not-allowed border-transparent text-[var(--oc-muted)] opacity-60"
                        : "border-transparent text-[var(--oc-muted)] hover:text-[var(--oc-text)]"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {a.label}
                    {/* Marca discreta: se entra, pero no guarda. No es un
                        estado de error, así que no lleva el color de alerta. */}
                    {esMaqueta ? (
                      <span className="rounded-full border border-[var(--oc-border)] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[var(--oc-muted)]">
                        Vista previa
                      </span>
                    ) : null}
                  </span>
                  {aviso ? (
                    <span className="mt-1 block text-[11px] font-medium leading-snug">{aviso}</span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
