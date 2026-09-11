"use client";

/**
 * shell-oceano.tsx — EL shell único del sistema (rediseño Océano).
 *
 * Un solo shell parametrizado por rol, no cinco pantallas. Dibuja los TRES
 * niveles de navegación del diseño:
 *   1. barra superior  → pestañas globales del rol (NavSuperiorOceano)
 *   2. rail lateral    → apartados de la pestaña activa (SidebarOceano),
 *                        anclado al borde izquierdo y a todo el alto
 *   3. barra de modo   → sub-vistas del apartado, arriba a la derecha
 *
 * REGLA ARQUITECTÓNICA (Fase 1): el shell es PRESENTACIÓN. No consulta datos,
 * no decide dominio y no conoce permisos. Todo lo que sabe de la navegación
 * viene del módulo puro `lib/navegacion/mapa-navegacion.ts` — aquí NO se
 * duplica ni una pestaña ni un apartado.
 *
 * Consecuencia directa de eso: «denegado por capacidad» no se representa. Una
 * pestaña o un apartado ausente del mapa no se dibuja, y punto (el mapa ya la
 * quitó al rol que no la tiene). «Apagado» es otra cosa y sí se dibuja: existe
 * para ese rol y le llegará.
 *
 * Sin lógica de datos: por eso es el ÚNICO archivo con "use client" de la
 * carpeta; las piezas de los tres niveles son presentacionales.
 */
import { useState } from "react";
import type { PortalRole } from "@/lib/auth/types";
import { piezaDe } from "@/lib/navegacion/contenido-alumno";
import {
  apartadoInicial,
  ordenSidebar,
  pestana,
  pestanasDe,
  type Apartado,
} from "@/lib/navegacion/mapa-navegacion";
import { BarraModoOceano } from "./barra-modo-oceano";
import {
  ContenidoAlumnoOceano,
  type DatosAlumnoOceano,
} from "./contenido-alumno-oceano";
import { ContenidoMarcadorOceano } from "./contenido-marcador-oceano";
import { NavSuperiorOceano } from "./nav-superior-oceano";
import { SidebarOceano } from "./sidebar-oceano";

/** Datos ya resueltos por el servidor para las piezas reales del alumno. */
export type { DatosAlumnoOceano };

type Seleccion = {
  idPestana: string;
  idApartado: string | null;
  modo: string | null;
};

/** Estado inicial: la primera pestaña del rol y su primer apartado NAVEGABLE
 *  (`apartadoInicial` salta los apagados; `null` = la pestaña no tiene ninguno,
 *  y entonces se muestra el estado de la pestaña en vez de contenido). */
function seleccionInicial(rol: PortalRole | null): Seleccion {
  const primera = pestanasDe(rol)[0] ?? null;
  if (!primera) return { idPestana: "", idApartado: null, modo: null };
  const inicial = apartadoInicial(rol, primera.id);
  return {
    idPestana: primera.id,
    idApartado: inicial?.id ?? null,
    modo: inicial?.modos[0] ?? null,
  };
}

export function ShellOceano({
  rol,
  nombre,
  datosAlumno = null,
}: {
  rol: PortalRole | null;
  nombre: string;
  /** Fase 2 — datos del alumno (misma action que /perfil). null = sin piezas. */
  datosAlumno?: DatosAlumnoOceano | null;
}) {
  const [sel, setSel] = useState<Seleccion>(() => seleccionInicial(rol));

  const pestanas = pestanasDe(rol);
  // La pestaña activa se RE-VALIDA contra el mapa en cada render: si el rol no
  // la tiene, se cae a la primera. El shell nunca dibuja una pestaña inventada.
  const activa = pestana(rol, sel.idPestana) ?? pestanas[0] ?? null;
  const apartados = activa?.apartados ?? [];
  const activo: Apartado | null =
    apartados.find((a) => a.id === sel.idApartado && a.estado === "activo") ?? null;

  function irAPestana(idPestana: string) {
    const inicial = apartadoInicial(rol, idPestana);
    setSel({ idPestana, idApartado: inicial?.id ?? null, modo: inicial?.modos[0] ?? null });
  }

  function irAApartado(idApartado: string) {
    const a = apartados.find((x) => x.id === idApartado);
    if (!a || a.estado !== "activo") return; // apagado = se dibuja, no navega
    setSel((s) => ({ ...s, idApartado, modo: a.modos[0] ?? null }));
  }

  return (
    <div
      className="relative z-10 flex min-h-dvh flex-col text-[var(--oc-text)]"
      style={{ background: "var(--oc-bg)" }}
    >
      <NavSuperiorOceano
        rol={rol}
        nombre={nombre}
        pestanas={pestanas}
        idActiva={activa?.id ?? null}
        onPestana={irAPestana}
      />

      <div className="flex flex-1 flex-col lg:flex-row">
        <SidebarOceano
          apartados={activa ? ordenSidebar(apartados, activo?.id ?? "") : []}
          idActivo={activo?.id ?? null}
          onApartado={irAApartado}
        />

        <main className="min-w-0 flex-1 px-5 py-6 sm:px-6 lg:px-10 lg:py-8">
          <BarraModoOceano
            modos={activo?.modos ?? []}
            modoActivo={sel.modo}
            onModo={(m) => setSel((s) => ({ ...s, modo: m }))}
          />
          {/* Fase 2 — si el hueco activo tiene pieza real Y hay datos, se monta
              el componente; si no, el marcador de la Fase 1. La decisión
              hueco→pieza vive en `lib/navegacion/contenido-alumno.ts`. */}
          {activa && activo && piezaDe(activa.id, activo.id) && datosAlumno ? (
            <ContenidoAlumnoOceano
              pieza={piezaDe(activa.id, activo.id)!}
              modo={sel.modo}
              datos={datosAlumno}
            />
          ) : (
            <ContenidoMarcadorOceano
              rol={rol}
              pestana={activa}
              apartado={activo}
              modo={sel.modo}
              piezaSinDatos={Boolean(
                activa && activo && piezaDe(activa.id, activo.id),
              )}
            />
          )}
        </main>
      </div>
    </div>
  );
}
