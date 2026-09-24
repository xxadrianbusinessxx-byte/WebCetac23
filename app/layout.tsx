import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { DecoracionFondo } from "@/app/components/ui/decoracion-fondo";
import { WebVitals } from "@/app/components/ui/web-vitals";
// PROMPT-5/B1 — UNA sola puerta para el cambio forzado de clave: el layout
// raíz la aplica a TODAS las rutas del portal (antes solo /configuracion,
// /profesor y /directivo la tenían; /perfil, /documentos y /tutor no).
import { PantallaCambioClaveForzado } from "@/app/components/cambio-clave-forzado";
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
            {/* La barra de navegación legacy se RETIRÓ el 2026-09-17. Llevaba
                semanas sin dibujarse en ninguna parte: devolvía null en `/`,
                `/login` y `/oceano`, y todas las demás rutas ya redirigen al
                portal. El logo CETAC vive ahora en la barra superior del shell. */}
            {children}
          </>
        )}
      </body>
    </html>
  );
}
