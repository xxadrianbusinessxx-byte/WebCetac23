import type { Metadata } from "next";
import { actionObtenerPerfilAlumno } from "@/app/actions/escolar";
import { actionListarMateriasConNombreVisible } from "@/app/actions/materias";
import { actionListarAlumnosDelTutor } from "@/app/actions/tutores";
import {
  ShellOceano,
  type DatosAlumnoOceano,
  type DatosDocenteOceano,
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
export default async function OceanoPage({
  searchParams,
}: {
  searchParams: Promise<{ alumno?: string }>;
}) {
  const params = await searchParams;
  const sesion = await obtenerSesionPortal();
  const rol = sesion?.rol ?? null;

  // Fase 2/4 — datos de las piezas del alumno. Es la MISMA Server Action que ya
  // usa `/perfil` (`actionObtenerPerfilAlumno`), no una consulta nueva, y se pide
  // en dos casos:
  //   · ALUMNO  → su propio perfil (sin curp: la resuelve la action de la sesión).
  //   · TUTOR   → el alumno VINCULADO que eligió (`?alumno=CURP`); la action
  //               valida la relación en el servidor antes de devolver nada.
  // Maestro/directivo necesitan su propio selector y entran en su fase (5-6).
  const esAlumno = rol === "alumno";
  const esTutor = rol === "tutor";

  // La lista de vinculados se resuelve UNA vez por navegación (no por componente)
  // y es lo que el selector puede ofrecer. Con un solo alumno se elige solo.
  const alumnosVinculados = esTutor ? await actionListarAlumnosDelTutor() : [];
  const curpPedida = (params.alumno ?? "").trim().toUpperCase();
  const curpConsulta = !esTutor
    ? null
    : (alumnosVinculados.find((a) => a.curp.trim().toUpperCase() === curpPedida)?.curp ??
      alumnosVinculados[0]?.curp ??
      null);

  const perfil =
    esAlumno || esTutor ? await actionObtenerPerfilAlumno(curpConsulta) : null;
  const datosAlumno: DatosAlumnoOceano | null =
    perfil && perfil.acceso?.puedeLeer
      ? {
          curp: perfil.alumno?.CURP ?? "",
          nombre: perfil.alumno ? nombreCompletoAlumno(perfil.alumno) : "",
          clave: perfil.alumno?.CLAVE ?? "",
          fotoPerfilUrl: perfil.fotoPerfilUrl,
          materias: perfil.materias,
          registro: perfil.registro,
          etiquetas: perfil.etiquetas,
          comentarios: perfil.comentarios,
          etiquetasDinamicas: perfil.etiquetasDinamicas,
          tutorContacto: perfil.tutorContacto,
          puedeEditarEtiquetas: perfil.acceso.puedeEditarEtiquetas,
          puedeImportarEtiquetas: perfil.acceso.puedeImportarEtiquetas,
          puedeEditarDatosPersonales: perfil.acceso.puedeEditarDatosPersonales,
        }
      : null;

  // Fase 5 — catálogo del docente. `actionListarMateriasConNombreVisible` solo
  // exige `materia.ver_catalogo` y YA aplica el alcance R-4: con asignaciones
  // activas devuelve las del maestro, sin ellas cae al catálogo del operativo.
  // La pantalla pinta lo que la action devuelva; nunca pide «todo el catálogo».
  const esDocente = rol === "maestro" || rol === "directivo";
  const materiasDocente = esDocente ? await actionListarMateriasConNombreVisible() : [];
  const datosDocente: DatosDocenteOceano | null = esDocente
    ? {
        materias: materiasDocente,
        profesorClave: sesion?.matricula ?? "",
        nombreProfesor: sesion?.nombre ?? sesion?.matricula ?? "",
      }
    : null;

  // `key={rol}`: si cambia el rol (otra sesión sobre la misma pestaña del
  // navegador), el shell se remonta con su estado inicial en vez de arrastrar
  // la pestaña activa de la sesión anterior. Cambiar de ALUMNO no remonta nada:
  // el alumno elegido se conserva al cambiar de pestaña o de apartado.
  return (
    <ShellOceano
      key={rol ?? "sin-sesion"}
      rol={rol}
      nombre={sesion?.nombre ?? sesion?.matricula ?? ""}
      datosAlumno={datosAlumno}
      datosDocente={datosDocente}
      alumnosVinculados={esTutor ? alumnosVinculados : undefined}
      alumnoSeleccionado={curpConsulta}
    />
  );
}
