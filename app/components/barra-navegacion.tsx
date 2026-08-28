"use client";

import Image from "next/image";
import { usePathname } from "next/navigation";
import { LOGO_ESQUINAS_SRC } from "@/lib/decoraciones/config";
import type { PortalRole } from "@/lib/auth/types";
import { GlossyNavPill } from "./glossy-nav-pill";

type ItemNav = { href: string; label: string; activo: boolean };

function origenChatPara(rol: PortalRole): string {
  if (rol === "directivo") return "directivo";
  if (rol === "maestro") return "profesor";
  return "perfil";
}

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
  if (!rol || pathname === "/" || pathname === "/login") return null;

  const origen = origenChatPara(rol);
  const items: ItemNav[] = [];

  if (rol === "tutor") {
    // El tutor NO tiene perfil de alumno propio en /perfil (quedaría vacío);
    // su espacio es /tutor, por eso no se ofrece el botón "Perfil".
    items.push({
      href: "/tutor",
      label: "Tutor / Padre",
      activo: pathname.startsWith("/tutor"),
    });
  } else if (rol === "maestro") {
    items.push({
      href: "/profesor",
      label: "Profesor",
      activo: pathname.startsWith("/profesor"),
    });
    if (tieneDocumentos) {
      items.push({
        href: "/documentos",
        label: "Documentos",
        activo: pathname.startsWith("/documentos"),
      });
    }
  } else if (rol === "directivo") {
    items.push(
      {
        href: "/directivo",
        label: "Directivo",
        // El directivo también consulta el perfil del alumno desde su panel.
        activo:
          pathname.startsWith("/directivo") || pathname.startsWith("/perfil"),
      },
      {
        href: "/documentos",
        label: "Documentos",
        activo: pathname.startsWith("/documentos"),
      },
    );
  } else {
    // alumno
    items.push({
      href: "/perfil",
      label: "Perfil",
      activo: pathname.startsWith("/perfil"),
    });
  }

  items.push({
    href: `/chat?origen=${origen}`,
    label: "Chat",
    activo: pathname.startsWith("/chat"),
  });

  if (rol === "directivo") {
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
