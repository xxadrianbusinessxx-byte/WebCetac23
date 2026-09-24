import type { Metadata } from "next";
import { actionObtenerPerfilAlumno } from "@/app/actions/escolar";
import { actionListarMateriasConNombreVisible } from "@/app/actions/materias";
import { actionListarAlumnosDelTutor } from "@/app/actions/tutores";
import {
  ShellOceano,
  type DatosAlumnoOceano,
  type DatosDirectivoOceano,
  type DatosDocenteOceano,
} from "@/app/components/oceano/shell-oceano";
import { puede } from "@/lib/auth/permisos";
import { createClient } from "@/lib/supabase/server";
import { nombreCompletoAlumno } from "@/lib/escolar/alumno/alumnos";
import { obtenerCicloOperativoGlobal } from "@/lib/escolar/ciclo/ciclo-estado";
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
          // UIs pendientes (2026-09-17): los dos flags de Actividades se
          // resuelven aquí con la MISMA `puede()` del servidor. La UI los
          // recibe; no pregunta por el rol.
          puedeEditarActividades: puede(rol, "actividad.editar"),
          puedeEntregarActividades: puede(rol, "actividad.entregar"),
        }
      : null;

  // Fase 5 — catálogo del docente. `actionListarMateriasConNombreVisible` solo
  // exige `materia.ver_catalogo` y YA aplica el alcance R-4: con asignaciones
  // activas devuelve las del maestro, sin ellas cae al catálogo del operativo.
  // La pantalla pinta lo que la action devuelva; nunca pide «todo el catálogo».
  const esDocente = rol === "maestro" || rol === "directivo";
  const materiasDocente = esDocente ? await actionListarMateriasConNombreVisible() : [];

  // Fase 9 — el ciclo operativo. Lo pide el técnico para la carga académica y
  // AHORA también el docente, para que `Calendario › Calendario escolar` abra
  // en el ciclo en curso y no en el primero de la lista alfabética. Es la misma
  // lectura de siempre; solo se amplía a quién se le sirve.
  const nombreCicloOperativo =
    rol === "tecnico" || esDocente
      ? await (async () => {
          const supabase = await createClient();
          const ciclo = await obtenerCicloOperativoGlobal(supabase);
          return ciclo.ok && ciclo.periodo ? String(ciclo.periodo.nombre).trim() : "";
        })()
      : "";

  const datosDocente: DatosDocenteOceano | null = esDocente
    ? {
        materias: materiasDocente,
        profesorClave: sesion?.matricula ?? "",
        nombreProfesor: sesion?.nombre ?? sesion?.matricula ?? "",
        cicloOperativo: nombreCicloOperativo,
        // La capacidad la resuelve el SERVIDOR con la misma `puede()` de la
        // matriz. La UI no pregunta por el rol: recibe la respuesta.
        puedeResolverJustificaciones: puede(rol, "justificacion.resolver"),
      }
    : null;

  // Fase 6 — lo exclusivo del directivo sale del MISMO catálogo que el docente:
  // grado, grupo y carrera son facetas de `MateriaIdentidad`, así que no hace
  // falta ninguna consulta nueva para poblar el selector de ámbito.
  const datosDirectivo: DatosDirectivoOceano | null =
    rol === "directivo" ? { materias: materiasDocente } : null;

  // La carga académica del técnico sigue esperando una lista; se arma con el
  // mismo nombre que se acaba de leer, sin repetir la consulta.
  const periodos = rol === "tecnico" && nombreCicloOperativo ? [nombreCicloOperativo] : [];

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
      datosDirectivo={datosDirectivo}
      periodos={periodos}
      alumnosVinculados={esTutor ? alumnosVinculados : undefined}
      alumnoSeleccionado={curpConsulta}
    />
  );
}
