import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { actionTieneAccesoDocumentos } from "./actions/documentos";
import { BarraNavegacionGlobal } from "./components/barra-navegacion";
import { DecoracionFondo } from "./components/decoracion-fondo";
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
  // Solo los maestros necesitan consultar permisos; los directivos siempre
  // tienen acceso a Documentos y el resto de roles no lo usan.
  const tieneDocumentos =
    sesion?.rol === "maestro" ? await actionTieneAccesoDocumentos() : false;

  return (
    <html lang="es" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-slate-800">
        {/* C4.27-A/B — Fondo global vivo montado UNA sola vez (fixed, decorativo). */}
        <DecoracionFondo />
        {/* C4.27-C/D — Barra de navegación global (franja sticky, con logo CETAC). */}
        <BarraNavegacionGlobal
          rol={sesion?.rol ?? null}
          tieneDocumentos={tieneDocumentos}
        />
        {children}
      </body>
    </html>
  );
}
