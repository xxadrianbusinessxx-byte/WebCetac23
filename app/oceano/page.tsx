import type { Metadata } from "next";
import { actionObtenerPerfilAlumno } from "@/app/actions/escolar";
import {
  ShellOceano,
  type DatosAlumnoOceano,
} from "@/app/components/oceano/shell-oceano";
import { nombreCompletoAlumno } from "@/lib/escolar/alumno/alumnos";
import { obtenerSesionPortal } from "@/lib/auth/session-server";

// La sesión vive en una cookie firmada: esta ruta no se prerenderiza.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "AulaNube — Shell Océano",
  description:
    "Shell único del rediseño Océano: tres niveles de navegación parametrizados por rol, sin lógica de datos.",
};

/**
 * Ruta de PREVISUALIZACIÓN del shell (Fase 1 del rediseño Océano).
 *
 * No sustituye a ninguna ruta viva: /perfil, /profesor, /directivo,
 * /configuracion, /tutor y /documentos siguen funcionando intactas (R8). Esta
 * ruta existe para poder ver y revisar la barra superior por rol, el sidebar,
 * la barra de modo y el contraste de los tokens --oc-* sobre las cinco
 * sesiones. El shell se monta con el rol de la sesión; sin sesión no dibuja
 * pestañas (el mapa devuelve lista vacía), así que no expone nada.
 */
export default async function OceanoPage() {
  const sesion = await obtenerSesionPortal();
  const rol = sesion?.rol ?? null;

  // Fase 2 — datos de las piezas reales del alumno. Es la MISMA Server Action
  // que ya usa `/perfil` (`actionObtenerPerfilAlumno`), no una consulta nueva, y
  // se pide SOLO con sesión de alumno: es la audiencia de esas piezas y el único
  // rol cuyo perfil se resuelve sin elegir un alumno. Tutor/maestro/directivo
  // necesitan selector de alumno y entran en su propia fase (4 y 5-6).
  const esAlumno = rol === "alumno";
  const perfil = esAlumno ? await actionObtenerPerfilAlumno(null) : null;
  const datosAlumno: DatosAlumnoOceano | null =
    perfil && perfil.acceso?.puedeLeer
      ? {
          curp: perfil.alumno?.CURP ?? "",
          nombre: perfil.alumno ? nombreCompletoAlumno(perfil.alumno) : "",
          materias: perfil.materias,
          registro: perfil.registro,
          etiquetas: perfil.etiquetas,
          comentarios: perfil.comentarios,
          etiquetasDinamicas: perfil.etiquetasDinamicas,
          puedeEditarEtiquetas: perfil.acceso.puedeEditarEtiquetas,
          puedeImportarEtiquetas: perfil.acceso.puedeImportarEtiquetas,
        }
      : null;

  // `key={rol}`: si cambia el rol (otra sesión sobre la misma pestaña del
  // navegador), el shell se remonta con su estado inicial en vez de arrastrar
  // la pestaña activa de la sesión anterior.
  return (
    <ShellOceano
      key={rol ?? "sin-sesion"}
      rol={rol}
      nombre={sesion?.nombre ?? sesion?.matricula ?? ""}
      datosAlumno={datosAlumno}
    />
  );
}
