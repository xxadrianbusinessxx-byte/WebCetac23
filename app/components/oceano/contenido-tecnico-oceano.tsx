"use client";

/**
 * contenido-tecnico-oceano.tsx — monta las piezas del rol técnico.
 *
 * Es el rol más barato del rediseño: todas sus piezas YA existen y funcionan.
 * Hoy viven apiladas en `app/configuracion/page.tsx` —seis paneles uno debajo
 * de otro con guardas `puede(...)`— y aquí solo se reparten en los tres
 * niveles de navegación. Ni un modelo de datos nuevo, ni una capacidad nueva,
 * ni una firma cambiada.
 *
 * Las guardas `puede(...)` que envuelven cada panel en su ruta actual NO se
 * replican aquí: el mapa ya decide qué se DIBUJA y cada action sigue decidiendo
 * qué se PUEDE. Repetir la comprobación en la interfaz sería un segundo camino.
 */
import type { ReactNode } from "react";
import { AliasesVolumenPanel } from "@/app/components/aliases-volumen-panel";
import { AsignacionesProfesorAdmin } from "@/app/components/asignaciones-admin";
import { BajaRosterPanel } from "@/app/components/baja-roster-panel";
import { CalendarioEscolarPanel } from "@/app/components/calendario-escolar-panel";
import { CicloConfigurador } from "@/app/components/ciclo-configurador";
import { DeshacerPasoPanel } from "@/app/components/deshacer-paso-panel";
import { DocumentosPanel } from "@/app/components/documentos-panel";
import { MensajesInternosPanel } from "@/app/components/mensajes-internos-panel";
import { PortadaMediosPanel } from "@/app/components/portada-medios-panel";
import { HorarioEscolarPanel } from "@/app/components/horario-escolar-panel";
import { ImportarEtiquetasPanel } from "@/app/components/importar-etiquetas-panel";
import { RosterAlumnosPanel } from "@/app/components/roster-alumnos-panel";
import { MateriasConfigPanel } from "@/app/components/materias-config-panel";
import { ProfesoresCredencialesPanel } from "@/app/components/profesores-credenciales-panel";
import { TutoresPanel } from "@/app/components/tutores-panel";
import type { PiezaTecnico } from "@/lib/navegacion/contenido-tecnico";

/** Hueco declarado: la pieza existe, pero no donde este apartado la necesita.
 *  Se dice en pantalla en vez de improvisar una interfaz nueva. */
function Pendiente({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-[var(--oc-border)] bg-[var(--oc-surface)] px-4 py-3 text-xs font-semibold text-[var(--oc-muted)]">
      {children}
    </p>
  );
}

export function ContenidoTecnicoOceano({
  pieza,
  modo,
  periodos,
}: {
  pieza: PiezaTecnico;
  modo: string | null;
  /** Ciclos disponibles para la carga académica. Los resuelve el servidor. */
  periodos: string[];
}) {
  switch (pieza) {
    // Contenido › Documentos. El panel no recibe props: resuelve su propio
    // estado con `actionObtenerEstadoDocumentos`, que ya exige `documento.ver`
    // y devuelve el nivel de permiso del usuario. La UI no decide el acceso,
    // lo recibe resuelto del servidor.
    case "mensajes-internos":
      return <MensajesInternosPanel />;

    case "documentos":
      return <DocumentosPanel />;

    // Configuración → Video e imágenes: la portada pública (PROMPT N). El
    // servidor exige `noticia.publicar` en cada acción; aquí solo se monta.
    case "portada-medios":
      return <PortadaMediosPanel />;

    case "ciclo-configurador":
      // Sus 7 pasos YA eran un conmutador interno; ahora el nivel 3 del shell
      // hace ese papel. El componente no se reescribe: el usuario elige el
      // paso desde la barra de modo y el panel sigue siendo el mismo.
      return <CicloConfigurador />;

    case "ciclo-lista":
      // La lista de ciclos (activar, clonar, histórico) vive DENTRO de
      // CicloConfigurador, encima de sus pasos. Separarla en su propio
      // apartado exige partir ese componente, que es un cambio de dominio con
      // su propia verificación — no se hace de paso en una migración visual.
      return (
        <Pendiente>
          La lista de ciclos vive dentro del Configurador, sobre sus siete
          pasos. Separarla en este apartado exige partir ese componente y se
          hace en su propio cambio.
        </Pendiente>
      );

    case "calendario-escolar-admin":
      return <CalendarioEscolarPanel />;

    case "horario-escolar-admin":
      return <HorarioEscolarPanel />;

    case "deshacer-paso":
      return <DeshacerPasoPanel />;

    case "materias-config":
      // Dos piezas en el mismo apartado, como en `/configuracion`: el catálogo
      // con sus aliases individuales y el panel de volumen.
      return (
        <div className="flex flex-col gap-4">
          <MateriasConfigPanel materias={[]} />
          {(modo ?? "").toLowerCase().includes("volumen") ? <AliasesVolumenPanel /> : null}
        </div>
      );

    case "asignaciones-profesor":
      return <AsignacionesProfesorAdmin />;

    case "roster-alumnos": {
      // Los tres paneles del alumnado. Roster y Etiquetas se EXTRAJERON de
      // `configuracion-client.tsx`, donde vivían escritos en línea; por eso
      // antes este apartado solo podía ofrecer Baja y restauración.
      //
      // Roster y carga académica van en el MISMO panel a propósito: comparten
      // el archivo subido y el mapeo de columnas, así que son un solo flujo.
      // Los modos del mapa deciden cuál se muestra.
      const m = (modo ?? "").toLowerCase();
      if (m.startsWith("baja")) return <BajaRosterPanel />;
      if (m.startsWith("etiquetas")) return <ImportarEtiquetasPanel />;
      return <RosterAlumnosPanel periodos={periodos} />;
    }

    case "tutores":
      return <TutoresPanel />;

    case "profesores-credenciales":
      // `ocultarId`: el técnico repone claves sin ver la identidad estructural
      // (PROFESORES.ID). Es el mismo montaje que hoy hace `/configuracion`.
      return <ProfesoresCredencialesPanel ocultarId />;
  }
}
