import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { actionTieneAccesoDocumentos } from "./actions/documentos";
import { BarraNavegacionGlobal } from "@/app/components/ui/barra-navegacion";
import { DecoracionFondo } from "@/app/components/ui/decoracion-fondo";
import { WebVitals } from "@/app/components/ui/web-vitals";
// PROMPT-5/B1 — UNA sola puerta para el cambio forzado de clave: el layout
// raíz la aplica a TODAS las rutas del portal (antes solo /configuracion,
// /profesor y /directivo la tenían; /perfil, /documentos y /tutor no).
import { PantallaCambioClaveForzado } from "@/app/components/cambio-clave-forzado";
import { puede, esRol } from "@/lib/auth/permisos";
import { obtenerSesionPortal } from "@/lib/auth/session-server";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "AulaNube — Panel docente",
  description:
    "Plataforma escolar con un espacio claro y acogedor para maestras y maestros.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const sesion = await obtenerSesionPortal();
  // PROMPT-3/T2: la UI decide por capacidad con la MISMA puede() del servidor.
  // Documentos lo ve quien tiene documento.ver; los maestros además necesitan
  // al menos un permiso otorgado (consulta de acceso), los directivos/técnicos
  // siempre lo tienen.
  const puedeDocumentos = sesion ? puede(sesion.rol, "documento.ver") : false;
  const esMaestro = sesion ? esRol(sesion.rol, "maestro") : false;
  const tieneDocumentos =
    puedeDocumentos && esMaestro
      ? await actionTieneAccesoDocumentos()
      : puedeDocumentos;

  // PROMPT-5/B1 — UNA sola puerta para el cambio forzado de clave. Se aplica en
  // el layout raíz (TODAS las rutas del portal: profesor, directivo,
  // configuracion, perfil, documentos y tutor). Mientras la sesión traiga
  // debeCambiarCredenciales no se monta ni la barra ni la consola de la ruta:
  // solo la pantalla de cambio. Al guardar, la action limpia el flag de la
  // cookie y `router.refresh()` re-ejecuta este layout con la sesión ya limpia.
  const debeCambiar = sesion?.debeCambiarCredenciales === true;

  return (
    <html lang="es" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-slate-800">
        {debeCambiar ? (
          <PantallaCambioClaveForzado
            nombre={sesion?.nombre ?? sesion?.matricula ?? ""}
            uidAvatar="layout-cambio-clave-forzado"
          />
        ) : (
          <>
            {/* FASE 9 — instrumentación de Web Vitals (dev + opt-in en producción). */}
            <WebVitals />
            {/* C4.27-A/B — Fondo global vivo montado UNA sola vez (fixed, decorativo). */}
            <DecoracionFondo />
            {/* C4.27-C/D — Barra de navegación global (franja sticky, con logo CETAC). */}
            <BarraNavegacionGlobal
              rol={sesion?.rol ?? null}
              tieneDocumentos={tieneDocumentos}
            />
            {children}
          </>
        )}
      </body>
    </html>
  );
}
