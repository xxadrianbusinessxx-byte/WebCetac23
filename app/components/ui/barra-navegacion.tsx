"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { LOGO_ESQUINAS_SRC } from "@/lib/decoraciones/config";
import { puede, esRol } from "@/lib/auth/permisos";
import type { PortalRole } from "@/lib/auth/types";
import { GlossyNavPill } from "@/app/components/ui/glossy-nav-pill";

type ItemNav = { href: string; label: string; activo: boolean };

// Helpers de rol de la UI: la barra decide el HOGAR de cada rol y usa puede()
// para los enlaces transversales. Se mantienen como esRol* (mismo rol === que
// en permisos.ts) sin duplicar la matriz.
const esRolTutor = (r: PortalRole | null) => esRol(r, "tutor");
const esRolMaestro = (r: PortalRole | null) => esRol(r, "maestro");
const esRolDirectivo = (r: PortalRole | null) => esRol(r, "directivo");
const esRolTecnico = (r: PortalRole | null) => esRol(r, "tecnico");
const esRolAlumno = (r: PortalRole | null) => esRol(r, "alumno");

/**
 * C4.27-C/D — Barra de navegación global.
 * Franja de extremo a extremo (sticky en el top), transparente con luz
 * difusa hacia los extremos y logo CETAC en la esquina derecha. Se monta
 * UNA sola vez en app/layout.tsx. Nunca aparece en las rutas públicas de
 * acceso (/, /login), haya o no sesión.
 */
export function BarraNavegacionGlobal({
  rol,
  tieneDocumentos,
}: {
  rol: PortalRole | null;
  tieneDocumentos: boolean;
}) {
  const pathname = usePathname() ?? "";
  // Fase 1 (Océano): `/oceano` monta su PROPIO nivel 1 (nav-superior-oceano),
  // así que la barra legacy se retira de esa ruta para no apilar dos barras.
  // En las rutas vivas la condición no cambia: el comportamiento es el de antes.
  if (
    !rol ||
    pathname === "/" ||
    pathname === "/login" ||
    pathname.startsWith("/oceano")
  ) {
    return null;
  }

  const items: ItemNav[] = [];

  // Hogar principal de cada rol (su pantalla de aterrizaje).
  if (esRolTutor(rol)) {
    // El tutor NO tiene perfil de alumno propio en /perfil (quedaría vacío);
    // su espacio es /tutor, por eso no se ofrece el botón "Perfil".
    // FASE 2 — además del portal se ofrece la sección «Alumno»: índice de
    // alumnos vinculados (selector) con acceso al perfil de cada uno.
    items.push({
      href: "/tutor",
      label: "Tutor / Padre",
      activo: pathname.startsWith("/tutor"),
    });
    items.push({
      href: "/tutor?tab=alumnos",
      label: "Alumno",
      activo: pathname.startsWith("/tutor"),
    });
  } else if (esRolMaestro(rol)) {
    items.push({
      href: "/profesor",
      label: "Profesor",
      activo: pathname.startsWith("/profesor"),
    });
  } else if (esRolDirectivo(rol)) {
    items.push({
      href: "/directivo",
      label: "Directivo",
      // El directivo también consulta el perfil del alumno desde su panel.
      activo:
        pathname.startsWith("/directivo") || pathname.startsWith("/perfil"),
    });
  } else if (esRolTecnico(rol)) {
    // PROMPT-3: la consola del técnico es /configuracion (T2/T3): asignaciones
    // profesor→materia, credenciales de acceso y el resto de su matriz §4.
    items.push({
      href: "/configuracion",
      label: "Técnico",
      activo: pathname.startsWith("/configuracion"),
    });
  } else if (esRolAlumno(rol)) {
    items.push({
      href: "/perfil",
      label: "Perfil",
      activo: pathname.startsWith("/perfil"),
    });
  }

  // Enlaces transversales gobernados por CAPACIDAD (misma puede() del servidor):
  // - Documentos: quien tiene documento.ver (maestro con acceso, directivo, técnico).
  // - Configuración: quien puede configurar el ciclo (directivo y técnico durante
  //   T1–T4; tras T5 solo el técnico, porque directivo pierde ciclo.*).
  if (
    puede(rol, "documento.ver") &&
    !items.some((i) => i.href === "/documentos")
  ) {
    // El maestro solo ve /documentos si además tiene al menos un permiso
    // otorgado (tieneDocumentos); el resto con la capacidad lo ven siempre.
    const requiereAccesoAdicional = esRolMaestro(rol);
    if (!requiereAccesoAdicional || tieneDocumentos) {
      items.push({
        href: "/documentos",
        label: "Documentos",
        activo: pathname.startsWith("/documentos"),
      });
    }
  }
  if (
    puede(rol, "ciclo.crear") &&
    !items.some((i) => i.href === "/configuracion")
  ) {
    items.push({
      href: "/configuracion",
      label: "Configuración",
      activo: pathname.startsWith("/configuracion"),
    });
  }

  return (
    <header className="app-nav-bar" aria-label="Navegación principal">
      <div className="app-nav-bar__glow" aria-hidden />
      <nav className="app-nav-bar__nav">
        <div className="app-nav-bar__pills">
          {items.map((item) => (
            <GlossyNavPill key={item.href} href={item.href} active={item.activo}>
              {item.label}
            </GlossyNavPill>
          ))}
        </div>
        <Image
          src={LOGO_ESQUINAS_SRC}
          alt=""
          width={160}
          height={160}
          unoptimized
          aria-hidden
          className="app-nav-bar__logo"
        />
      </nav>
    </header>
  );
}
