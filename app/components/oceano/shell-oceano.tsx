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
import { useRouter } from "next/navigation";
import type { PortalRole } from "@/lib/auth/types";
import { opcionesDePieza, piezaDe } from "@/lib/navegacion/contenido-alumno";
import { piezaDe as piezaDirectivoDe } from "@/lib/navegacion/contenido-directivo";
import { piezaDe as piezaDocenteDe } from "@/lib/navegacion/contenido-docente";
import { piezaDe as piezaTecnicoDe } from "@/lib/navegacion/contenido-tecnico";
import {
  apartadoInicial,
  esNavegable,
  ordenSidebar,
  pestana,
  pestanasDe,
  textoMaqueta,
  type Apartado,
} from "@/lib/navegacion/mapa-navegacion";
import { hayMaqueta, MaquetaOceano } from "./maquetas-oceano";
import { BarraModoOceano } from "./barra-modo-oceano";
import {
  ContenidoAlumnoOceano,
  type DatosAlumnoOceano,
} from "./contenido-alumno-oceano";
import {
  ContenidoDirectivoOceano,
  type DatosDirectivoOceano,
} from "./contenido-directivo-oceano";
import {
  ContenidoDocenteOceano,
  type DatosDocenteOceano,
} from "./contenido-docente-oceano";
import { ContenidoTecnicoOceano } from "./contenido-tecnico-oceano";
import { ContenidoMarcadorOceano } from "./contenido-marcador-oceano";
import { NavSuperiorOceano } from "./nav-superior-oceano";
import { SelectorAlumnoOceano } from "./selector-alumno-oceano";
import { SidebarOceano } from "./sidebar-oceano";

/** Datos ya resueltos por el servidor para las piezas reales. */
export type { DatosAlumnoOceano, DatosDirectivoOceano, DatosDocenteOceano };

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
  datosDocente = null,
  datosDirectivo = null,
  alumnosVinculados,
  alumnoSeleccionado = null,
}: {
  rol: PortalRole | null;
  nombre: string;
  /** Fase 2 — datos del alumno (misma action que /perfil). null = sin piezas. */
  datosAlumno?: DatosAlumnoOceano | null;
  /** Fase 5 — catálogo del docente, YA filtrado por el servidor (R-4). */
  datosDocente?: DatosDocenteOceano | null;
  /** Fase 6 — lo exclusivo del directivo (Grupos/Boleta, Alumnos/Tutores). */
  datosDirectivo?: DatosDirectivoOceano | null;
  /**
   * Fase 4 — alumnos VINCULADOS que el selector puede ofrecer. `undefined` =
   * este rol no lleva selector (no se dibuja nada). La lista la resuelve el
   * servidor: la UI nunca decide sobre qué alumno se puede consultar.
   */
  alumnosVinculados?: readonly { curp: string; nombre: string }[];
  /** CURP del alumno activo (el que fija de quién son los datos). */
  alumnoSeleccionado?: string | null;
}) {
  const router = useRouter();
  const [sel, setSel] = useState<Seleccion>(() => seleccionInicial(rol));

  const pestanas = pestanasDe(rol);
  // La pestaña activa se RE-VALIDA contra el mapa en cada render: si el rol no
  // la tiene, se cae a la primera. El shell nunca dibuja una pestaña inventada.
  const activa = pestana(rol, sel.idPestana) ?? pestanas[0] ?? null;
  const apartados = activa?.apartados ?? [];
  // NAVEGABLE, no «activo»: una maqueta también se abre. Comparar contra
  // "activo" a mano dejaría las maquetas fuera de alcance — que es justo lo
  // contrario de para lo que existen.
  const activo: Apartado | null =
    apartados.find((a) => a.id === sel.idApartado && esNavegable(a)) ?? null;

  function irAPestana(idPestana: string) {
    const inicial = apartadoInicial(rol, idPestana);
    setSel({ idPestana, idApartado: inicial?.id ?? null, modo: inicial?.modos[0] ?? null });
  }

  function irAApartado(idApartado: string) {
    const a = apartados.find((x) => x.id === idApartado);
    if (!esNavegable(a ?? null)) return; // apagado = se dibuja el rótulo, no navega
    setSel((s) => ({ ...s, idApartado, modo: a!.modos[0] ?? null }));
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
        >
          {/* Fase 4 — selector del alumno vinculado, por encima de los apartados.
              Cambiar de alumno es una navegación (el servidor es quien trae los
              datos); la pestaña y el apartado activos NO se pierden porque son
              estado de este componente. */}
          {alumnosVinculados ? (
            <SelectorAlumnoOceano
              alumnos={alumnosVinculados}
              seleccionado={alumnoSeleccionado}
              onSeleccionar={(curp) =>
                router.replace(`/oceano?alumno=${encodeURIComponent(curp)}`, {
                  scroll: false,
                })
              }
            />
          ) : null}
        </SidebarOceano>

        <main className="min-w-0 flex-1 px-5 py-6 sm:px-6 lg:px-10 lg:py-8">
          <BarraModoOceano
            modos={activo?.modos ?? []}
            modoActivo={sel.modo}
            onModo={(m) => setSel((s) => ({ ...s, modo: m }))}
          />
          {/* Fase 2 — si el hueco activo tiene pieza real Y hay datos, se monta
              el componente; si no, el marcador de la Fase 1. La decisión
              hueco→pieza vive en `lib/navegacion/contenido-alumno.ts`. */}
          {/* El aviso de maqueta va ARRIBA y no se oculta: quien entra tiene
              que saber, antes de pulsar nada, que esto no guarda. */}
          {activo && textoMaqueta(activo) ? (
            <p className="mb-4 rounded-lg border border-[var(--oc-border-active)] bg-[var(--oc-input)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]">
              {textoMaqueta(activo)}
            </p>
          ) : null}

          {/* Orden de precedencia: pieza real del alumno → pieza del docente →
              maqueta del diseño → marcador. Una maqueta nunca tapa una pieza
              que funciona. */}
          {activa && activo && activo.estado === "maqueta" && hayMaqueta(activa.id, activo.id) ? (
            <MaquetaOceano idPestana={activa.id} idApartado={activo.id} modo={sel.modo} />
          ) : activa && activo && piezaDe(activa.id, activo.id) && datosAlumno ? (
            <ContenidoAlumnoOceano
              pieza={piezaDe(activa.id, activo.id)!}
              modo={sel.modo}
              permitirJustificacion={opcionesDePieza(activa.id, activo.id).permitirJustificacion}
              datos={datosAlumno}
            />
          ) : activa && activo && piezaTecnicoDe(activa.id, activo.id) ? (
            /* Fase 7 — el técnico. No lleva `datos`: sus diez paneles ya
               resuelven sus propias lecturas, igual que hacen hoy en
               /configuracion. Reenviarles datos desde aquí sería inventar una
               vía nueva para algo que ya funciona. */
            <ContenidoTecnicoOceano
              pieza={piezaTecnicoDe(activa.id, activo.id)!}
              modo={sel.modo}
            />
          ) : activa && activo && piezaDirectivoDe(activa.id, activo.id) && datosDirectivo ? (
            /* Fase 6 — lo exclusivo del directivo. Va ANTES del docente en la
               cadena porque sus huecos no se solapan (la suite lo comprueba) y
               así el orden refleja de lo más específico a lo más compartido. */
            <ContenidoDirectivoOceano
              pieza={piezaDirectivoDe(activa.id, activo.id)!}
              datos={datosDirectivo}
            />
          ) : activa && activo && piezaDocenteDe(activa.id, activo.id) && datosDocente ? (
            /* Fase 5 — las dos pestañas que comparten maestro y directivo. El
               emparejamiento vive en `contenido-docente.ts`, uno solo para los
               dos roles porque en el mapa son el MISMO objeto de pestaña. */
            <ContenidoDocenteOceano
              pieza={piezaDocenteDe(activa.id, activo.id)!}
              modo={sel.modo}
              datos={datosDocente}
            />
          ) : (
            <ContenidoMarcadorOceano
              rol={rol}
              pestana={activa}
              apartado={activo}
              modo={sel.modo}
              piezaSinDatos={Boolean(
                activa &&
                  activo &&
                  (piezaDe(activa.id, activo.id) ||
                    piezaDocenteDe(activa.id, activo.id) ||
                    piezaDirectivoDe(activa.id, activo.id) ||
                    piezaTecnicoDe(activa.id, activo.id)),
              )}
            />
          )}
        </main>
      </div>
    </div>
  );
}
