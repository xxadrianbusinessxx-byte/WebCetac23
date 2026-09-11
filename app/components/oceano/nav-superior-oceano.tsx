/**
 * nav-superior-oceano.tsx — NIVEL 1 del shell Océano (barra superior global).
 *
 * Presentación pura: no consulta datos ni decide dominio. Recibe las pestañas
 * YA resueltas por el mapa (`lib/navegacion/mapa-navegacion.ts`) y avisa de la
 * pestaña pulsada. No lleva "use client": lo monta el shell, que es quien
 * maneja el estado de navegación.
 *
 * Contiene, como manda el diseño: sello CETAC + pestañas globales + chip de
 * usuario (nombre + rol) + «Cerrar sesión».
 *
 * «Cerrar sesión» YA OPERA. Estuvo deshabilitado durante las fases 1-9 porque
 * el sistema no tenía ninguna acción de cierre (la sesión solo se escribía, en
 * `setPortalSessionCookie`, y nunca se borraba). Ahora existe
 * `actionCerrarSesion`, que retira la cookie firmada y devuelve a `/login`.
 *
 * Es un `<form>` con Server Action y no un `onClick`: la cookie es `httpOnly`,
 * así que solo el servidor puede borrarla, y de este modo el botón funciona
 * también si el JavaScript del cliente no ha cargado todavía.
 */
import Image from "next/image";
import { actionCerrarSesion } from "@/app/actions/login";
import { LOGO_ESQUINAS_SRC } from "@/lib/decoraciones/config";
import type { PortalRole } from "@/lib/auth/types";
import type { Pestana } from "@/lib/navegacion/mapa-navegacion";

/** Rótulo humano del rol, para el chip de usuario. Solo presentación; no
 *  duplica la matriz de permisos ni el mapa de navegación. */
export const ROTULO_ROL: Record<PortalRole, string> = {
  alumno: "Alumno",
  maestro: "Profesor",
  directivo: "Directivo",
  tutor: "Tutor / Padre",
  tecnico: "Técnico",
};

export function NavSuperiorOceano({
  rol,
  nombre,
  pestanas,
  idActiva,
  onPestana,
}: {
  rol: PortalRole | null;
  nombre: string;
  /** Pestañas del rol, en orden. Ausente del mapa = no se dibuja. */
  pestanas: readonly Pestana[];
  idActiva: string | null;
  onPestana: (idPestana: string) => void;
}) {
  const nombreVisible = nombre.trim() || "—";
  const detalleRol = rol ? ROTULO_ROL[rol] : "Sin sesión";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--oc-border)] bg-[var(--oc-navy)]/92 backdrop-blur-md">
      <div className="flex w-full flex-wrap items-center gap-x-8 gap-y-2 px-5 py-3 sm:px-6 lg:px-10">
        {/* Nivel 1 — pestañas con separación FIJA y el grupo SIN tocar el borde
            izquierdo (Fase 2 · PASO 0/E1). NO `justify-between`: al estirar al
            ancho, con 2 pestañas (profesor) quedaban en extremos opuestos con un
            hueco de ~1500 px. El chip va aparte, con `ml-auto`, al extremo
            derecho. El ítem activo es TEXTO MENTA sin fondo: la menta aparece en
            DOS sitios en todo el sistema (nav activo y CTA primario) y en ambos
            es un toque; un bloque relleno haría que el acento dominara. */}
        {/* Sello CETAC en la esquina superior izquierda. Es DECORACIÓN: no
            enlaza a ninguna parte y va `aria-hidden`, para que un lector de
            pantalla no anuncie un elemento que no se puede usar. Es el mismo
            archivo que ya usaba la barra legacy (`LOGO_ESQUINAS_SRC`), no una
            copia nueva. */}
        <Image
          src={LOGO_ESQUINAS_SRC}
          alt=""
          width={160}
          height={160}
          unoptimized
          priority
          aria-hidden
          className="h-9 w-auto shrink-0 sm:h-10"
        />

        <nav
          aria-label="Pestañas globales"
          className="flex min-w-0 flex-wrap items-center gap-x-10 gap-y-1 lg:gap-x-16 lg:pl-2"
        >
          {pestanas.map((p) => {
            const activa = p.id === idActiva;
            return (
              <button
                key={p.id}
                type="button"
                aria-current={activa ? "true" : undefined}
                onClick={() => onPestana(p.id)}
                className={`py-2 text-sm font-bold tracking-wide transition ${
                  activa
                    ? "text-[var(--oc-mint)]"
                    : "text-[var(--oc-muted)] hover:text-[var(--oc-text)]"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </nav>

        {/* Extremo derecho: chip de usuario en DOS líneas (nombre arriba, en
            `--oc-text` y peso fuerte; rol debajo, en `--oc-muted` y menor) +
            «Cerrar sesión». Sin `uppercase`: forzarlo hacía que el rol se viera
            idéntico al nombre cuando la sesión trae el nombre en mayúsculas. */}
        <div className="ml-auto flex items-center gap-3">
          <span className="flex min-w-0 flex-col items-end rounded-xl border border-[var(--oc-border)] bg-[var(--oc-input)] px-3.5 py-1.5">
            <span className="max-w-[16rem] truncate text-sm font-semibold text-[var(--oc-text)]">
              {nombreVisible}
            </span>
            <span className="max-w-[16rem] truncate text-[11px] font-medium text-[var(--oc-muted)]">
              {detalleRol}
            </span>
          </span>

          {/* Sin sesión no hay nada que cerrar: el botón no se dibuja. */}
          {rol ? (
            <form action={actionCerrarSesion}>
              <button
                type="submit"
                className="rounded-full border border-[var(--oc-border)] px-3 py-1.5 text-sm font-semibold text-[var(--oc-muted)] transition hover:border-[var(--oc-border-active)] hover:text-[var(--oc-text)]"
              >
                Cerrar sesión
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </header>
  );
}
