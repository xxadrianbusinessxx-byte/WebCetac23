"use server";

/**
 * calificaciones-normalizadas.ts — Server Actions de las calificaciones
 * normalizadas (migración a `materias.id`, Opción B).
 *
 * CAPACIDAD → `exigir()`. ALCANCE → aquí. DECISIÓN → `calificaciones-puro`.
 * I/O → `lib/escolar/materia/calificaciones`.
 *
 * ── El alcance, que es el punto entero de este archivo ─────────────────────
 * `calificacion.ver` la tienen cinco roles. La capacidad dice QUÉ, nunca SOBRE
 * QUIÉN, así que aquí se decide de quién son las notas que se devuelven:
 *
 *   alumno, tutor  → lo delega `resolverAccesoAlumno`, que ya es la fuente
 *                    única de «¿puede esta sesión leer a este alumno?» (R6).
 *                    Resuelve además la CURP del alumno cuya cookie no la
 *                    trae, que este archivo por su cuenta no sabría hacer.
 *   maestro, directivo, administración → el alumno tiene que estar inscrito en
 *                    el grupo de la materia que se consulta.
 *   cualquier otro rol → nada.
 *
 * El último renglón es lo que hace que esto sea una lista BLANCA: un rol nuevo
 * en la matriz con `calificacion.ver` no hereda acceso por omisión, que es como
 * se filtran expedientes sin que nadie escriba una línea de más.
 *
 * ── Por qué el personal NO pasa por `resolverAccesoAlumno` ─────────────────
 * Su rama de maestro exige `asignaciones_profesor`, que hoy tiene CERO filas
 * (medido el 2026-09-30), así que devuelve false para TODOS los maestros:
 * delegar ahí dejaría a cada profesor sin poder ver ni subir una nota. Es la
 * misma razón por la que `actionHistorialAsistenciaAlumno` tampoco la usa.
 *
 * La pregunta que sí se puede responder con los datos de hoy es más estrecha y
 * más pertinente: «¿este alumno está en el grupo de ESTA materia?», que sale de
 * `inscripciones_alumno` (454 filas) → `grupos` → `grupo_materias`.
 *
 * DEUDA, anotada y no disimulada: eso no limita al maestro a las materias que
 * él imparte —cualquier maestro alcanza cualquier materia—. Ese cerrojo necesita
 * `asignaciones_profesor` poblada, que es trabajo de persona y ya está en
 * `pendientes.json`. Queda dicho aquí para que no parezca resuelto.
 *
 * Y la diferencia entre leer la CURP de la sesión y aceptarla por parámetro es
 * la diferencia entre «mis notas» y «las notas de quien yo escriba en la URL».
 *
 * ── Qué NO sustituye ───────────────────────────────────────────────────────
 * Convive con `actionObtenerVistaMateria` y con el flujo de subida existente
 * mientras la migración avanza (R8). Cuando todas las pantallas lean de aquí,
 * aquello se retira en su propio cambio.
 */
import { exigir } from "@/lib/auth/exigir";
// `esRol` y no una comparación literal de rol: la comparación vive en
// `permisos.ts` y `test-auditoria-permisos` lo verifica sobre el texto de este
// archivo. Aquí decide el ALCANCE, nunca el permiso.
import { esRol } from "@/lib/auth/permisos";
import type { PortalSessionPayload } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { obtenerCicloOperativoGlobal } from "@/lib/escolar/ciclo/ciclo-estado";
import { archivoCsvAFilas } from "@/lib/escolar/csv";
import { matrizATablaDeEntrada } from "@/lib/escolar/excel-a-registros";
import { esquemaArchivoMateria } from "@/lib/validacion/esquemas-puro";
import { leerFormData } from "@/lib/validacion/leer-form-data";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverAccesoAlumno } from "@/lib/escolar/alumno/acceso-alumno";
import {
  altaMateriaEnGrupo,
  calificacionesDeAlumno,
  calificacionesDeGrupoMateria,
  calificarActividad,
  cambiarEstadoMateriaEnGrupo,
  curpsDelGrupoMateria,
  grupoMateriaActiva,
  grupoMateriaDesdeTablaLegacy,
  guardarAlias,
  guardarCalificaciones,
  listarParejasDelPeriodo,
  materiasDelAlumno,
  type CalificacionRow,
  type MateriaDelAlumno,
  type ParejaParaGestion,
} from "@/lib/escolar/materia/calificaciones";
import {
  convertirTabla,
  notasDeAlumno,
  promedioActividades,
  type TablaDeEntrada,
} from "@/lib/escolar/materia/calificaciones-puro";
import {
  canonizarEncabezados,
  obtenerMapeoPorGrupoMateria,
} from "@/lib/escolar/materia/mapeo-columnas-materia";

type Fallo = { ok: false; error: string };
const fallo = (error: string): Fallo => ({ ok: false, error });

/** Roles de personal: su alcance es la materia, no un conjunto de alumnos. */
const ROLES_PERSONAL = ["maestro", "directivo", "administracion"] as const;

const esPersonal = (rol: PortalSessionPayload["rol"]): boolean =>
  ROLES_PERSONAL.some((r) => esRol(rol, r));

type Autorizacion = { ok: true; curp: string } | { ok: false; error: string };

/**
 * ¿Puede esta sesión leer las notas de `curpObjetivo` en `grupoMateriaId`?
 *
 * Devuelve la CURP ya resuelta y normalizada, que es lo que debe usarse para
 * consultar — no la que llegó por parámetro.
 *
 * Recibe la sesión en vez de pedirla: `exigir()` ya leyó la cookie, y volver a
 * leerla era el round-trip de más que medí en `app/actions/administracion.ts`.
 */
async function autorizarLectura(
  supabase: SupabaseClient,
  sesion: PortalSessionPayload,
  grupoMateriaId: string,
  curpObjetivo?: string | null,
): Promise<Autorizacion> {
  if (esPersonal(sesion.rol)) {
    const curp = (curpObjetivo ?? "").trim().toUpperCase();
    if (!curp) return { ok: false, error: "Indica la CURP del alumno." };
    // La materia tiene que ser una de las del alumno. Sin esto, el id de una
    // materia de otro grupo devolvería sus notas: el filtro por CURP de la
    // consulta no impide leer una materia que no le toca a ese alumno.
    const suyas = await materiasDelAlumno(supabase, curp);
    if (!suyas.some((m) => m.grupoMateriaId === grupoMateriaId)) {
      return { ok: false, error: "Ese alumno no está inscrito en esta materia." };
    }
    return { ok: true, curp };
  }

  // alumno y tutor: la decisión ya existe y vive en un solo sitio.
  const acc = await resolverAccesoAlumno(supabase, sesion, curpObjetivo ?? null);
  if (!acc.ok) return { ok: false, error: acc.error };
  if (!acc.acceso.puedeLeer) return { ok: false, error: "No tienes permiso." };
  return { ok: true, curp: acc.curp };
}

/* ── Lo que ve el alumno (y el tutor de su vinculado) ───────────────────── */

/** Las notas de un alumno en UNA materia. No incluye la lista de materias: un
 *  profesor que consulta a un alumno no necesita el resto de su carga, y
 *  devolverla vacía habría sido mentir sobre que no tiene ninguna. */
export type NotasDeMateria = {
  curp: string;
  actividades: { clave: string | null; valor: number | null }[];
  parciales: { clave: string | null; valor: number | null }[];
  /** El promedio tal como lo subió el profesor, si venía en su archivo. */
  promedio: number | null;
  final: number | null;
  /** El promedio CALCULADO de las actividades, con los pesos del mapeo si hay.
   *  Se devuelve aparte del anterior a propósito: si no coinciden, el que vale
   *  es el del profesor, y taparlo ocultaría el desacuerdo. */
  promedioActividades: number | null;
};

/** Lo que ve el alumno en su pantalla: su carga completa y, si entró a una
 *  materia, sus notas de esa materia. */
export type VistaCalificacionesAlumno = NotasDeMateria & {
  materias: MateriaDelAlumno[];
};

const vistaVacia = (curp: string, materias: MateriaDelAlumno[]): VistaCalificacionesAlumno => ({
  curp,
  materias,
  actividades: [],
  parciales: [],
  promedio: null,
  final: null,
  promedioActividades: null,
});

/**
 * La pantalla del alumno: su carga completa y, si entró a una materia, sus
 * notas de esa materia.
 *
 * `curpPedida` solo le sirve al TUTOR, que tiene que decir a qué vinculado se
 * refiere. Para un alumno es inoperante: `resolverAccesoAlumno` rechaza una
 * CURP que no sea la suya y resuelve la propia cuando no manda ninguna.
 */
export async function actionMisCalificaciones(
  grupoMateriaId?: string,
  curpPedida?: string,
): Promise<VistaCalificacionesAlumno | null> {
  const g = await exigir("calificacion.ver");
  if (!g.ok || !g.sesion) return null;

  // Esta pantalla es «las notas de un alumno». El personal no es un alumno:
  // usa `actionCalificacionesDeAlumno`, que exige la CURP explícitamente.
  if (esPersonal(g.sesion.rol)) return null;

  const supabase = await createClient();
  const acc = await resolverAccesoAlumno(supabase, g.sesion, curpPedida ?? null);
  if (!acc.ok || !acc.acceso.puedeLeer) return null;
  const curp = acc.curp;

  const materias = await materiasDelAlumno(supabase, curp);
  if (!grupoMateriaId) return vistaVacia(curp, materias);

  // Que la materia pedida sea una de las SUYAS. Sin esta línea, pasar el id de
  // una materia de otro grupo devolvería sus notas: el filtro por CURP de la
  // consulta no impide leer una materia que no te toca.
  if (!materias.some((m) => m.grupoMateriaId === grupoMateriaId)) {
    return vistaVacia(curp, materias);
  }

  return { ...(await armarVista(supabase, curp, grupoMateriaId)), materias };
}

/** Las notas de un alumno en una materia, ya agrupadas. Sin autorización:
 *  la resuelve quien llama, que es quien conoce el alcance. */
async function armarVista(
  supabase: SupabaseClient,
  curp: string,
  grupoMateriaId: string,
): Promise<NotasDeMateria> {
  const filas = await calificacionesDeAlumno(supabase, curp, grupoMateriaId);
  const n = notasDeAlumno(
    filas.map((f) => ({
      curp: f.curp,
      tipo: f.tipo,
      clave_columna: f.clave_columna,
      valor: f.valor,
    })),
    curp,
  );
  const mapeo = await obtenerMapeoPorGrupoMateria(supabase, grupoMateriaId);

  return {
    curp,
    actividades: n.actividades.map((a) => ({ clave: a.clave_columna, valor: a.valor })),
    parciales: n.parciales.map((p) => ({ clave: p.clave_columna, valor: p.valor })),
    promedio: n.promedio,
    final: n.final,
    promedioActividades: promedioActividades(n.actividades, mapeo?.pesosActividades ?? null),
  };
}

/**
 * Las notas de UN alumno pedido por CURP, en una materia.
 *
 * Para el personal es la vista «este alumno en esta materia». Un tutor llega
 * solo a sus vinculados y un alumno solo a sí mismo, porque el alcance lo
 * resuelve `autorizarLectura` y no el rol de quien llama.
 */
export async function actionCalificacionesDeAlumno(
  curpPedida: string,
  grupoMateriaId: string,
): Promise<NotasDeMateria | null> {
  const g = await exigir("calificacion.ver");
  if (!g.ok || !g.sesion) return null;
  if (!grupoMateriaId) return null;

  const supabase = await createClient();
  const aut = await autorizarLectura(supabase, g.sesion, grupoMateriaId, curpPedida);
  if (!aut.ok) return null;

  return armarVista(supabase, aut.curp, grupoMateriaId);
}

/* ── Lo que ve y escribe el profesor ────────────────────────────────────── */

/**
 * La tabla entera de una materia-grupo.
 *
 * Solo personal. El alumno y el tutor también tienen `calificacion.ver`, y sin
 * esta comprobación la capacidad por sí sola les entregaría las notas de todo
 * el grupo — que es justo lo que la tabla por materia dejaba hacer.
 */
export async function actionCalificacionesDeMateria(
  grupoMateriaId: string,
): Promise<CalificacionRow[]> {
  const g = await exigir("calificacion.ver");
  if (!g.ok || !g.sesion) return [];
  if (!grupoMateriaId) return [];
  if (!esPersonal(g.sesion.rol)) return [];

  const supabase = await createClient();
  return calificacionesDeGrupoMateria(supabase, grupoMateriaId);
}

/**
 * Sube el Excel del profesor, ya leído a (encabezados, filas).
 *
 * El mapeo se LEE de la base y no llega por parámetro: es la configuración que
 * el profesor guardó para esa materia, y aceptarla del cliente permitiría
 * reclasificar columnas en el momento de subir —declarar como «promedio» una
 * columna oculta, por ejemplo.
 */
export async function actionSubirCalificaciones(
  grupoMateriaId: string,
  tabla: TablaDeEntrada,
): Promise<ResultadoSubida> {
  const g = await exigir("calificacion.subir");
  if (!g.ok || !g.sesion) return fallo("No autorizado.");
  const supabase = await createClient();
  return subirTabla(supabase, g.sesion.profesorId ?? null, grupoMateriaId, tabla);
}

/**
 * La misma subida, desde el ARCHIVO tal como lo manda el formulario.
 *
 * Lee el archivo con `archivoCsvAFilas` —el mismo lector que la subida vieja,
 * CSV o Excel— y lo pasa por `matrizATablaDeEntrada`, que aplica la misma
 * regla de encabezados: el mapeo se configuró sobre los nombres que produce
 * esa regla, así que las dos subidas tienen que leer el archivo igual.
 */
export async function actionSubirCalificacionesArchivo(
  grupoMateriaId: string,
  formData: FormData,
): Promise<ResultadoSubida> {
  const g = await exigir("calificacion.subir");
  if (!g.ok || !g.sesion) return fallo("No autorizado.");

  const entrada = leerFormData(esquemaArchivoMateria, formData);
  if (!entrada.ok) return fallo(entrada.error);

  let matriz: string[][];
  try {
    ({ filas: matriz } = await archivoCsvAFilas(entrada.datos.archivo));
  } catch (e) {
    return fallo(e instanceof Error ? e.message : "No se pudo leer el archivo.");
  }

  const supabase = await createClient();
  return subirTabla(
    supabase,
    g.sesion.profesorId ?? null,
    grupoMateriaId,
    matrizATablaDeEntrada(matriz),
  );
}

type ResultadoSubida = { ok: true; escritas: number; avisos: string[] } | Fallo;

/**
 * El cuerpo de las dos subidas. Sin autorización: la resuelve la action que
 * llama, con `exigir()`, y pasa quién registra. Existe para que la variante con
 * archivo no vuelva a leer la cookie ni tenga su propia copia del cerrojo del
 * padrón, que es lo que impide escribir notas a alumnos de otro grupo.
 */
async function subirTabla(
  supabase: SupabaseClient,
  registradoPor: number | null,
  grupoMateriaId: string,
  tabla: TablaDeEntrada,
): Promise<ResultadoSubida> {
  if (!grupoMateriaId) return fallo("Falta la materia.");
  if (!tabla?.encabezados?.length) return fallo("El archivo llegó vacío.");
  if (!tabla.filas?.length) return fallo("El archivo no tiene ninguna fila de alumnos.");

  // Como la subida vieja (C4.18): una materia desactivada no admite notas. Si
  // no, desactivar dejaría de cerrar nada en cuanto se usara el camino nuevo.
  const activa = await grupoMateriaActiva(supabase, grupoMateriaId);
  if (activa === null) return fallo("Esa materia no existe en ningún grupo.");
  if (!activa) return fallo("Esta materia está desactivada en su grupo: no admite calificaciones.");

  const mapeo = await obtenerMapeoPorGrupoMateria(supabase, grupoMateriaId);
  if (!mapeo) {
    return fallo(
      "Esta materia no tiene configuración de columnas. Configúrala antes de subir: sin ella no se sabe qué significa cada columna del archivo.",
    );
  }

  // Los encabezados del archivo, con cada columna reconocida rebautizada con el
  // nombre que el mapeo guardó. Sin esto, re-subir con una variante del
  // encabezado («P. De partida 10%» contra «P. De partida↵10%») crearía una
  // segunda nota para la misma actividad en vez de actualizar la primera.
  const canon = canonizarEncabezados(tabla.encabezados, mapeo);
  if (!canon.ok) return fallo(canon.error);

  const conv = convertirTabla({ encabezados: canon.encabezados, filas: tabla.filas }, mapeo);
  if (!conv.ok) return fallo(conv.error);

  // El padrón del grupo. Una CURP que no esté en él se descarta: guardarla
  // crearía una fila con materia válida y alumno de nadie, que no falla, no
  // sale en ninguna pantalla y nadie descubre.
  const padron = await curpsDelGrupoMateria(supabase, grupoMateriaId);
  if (!padron) return fallo("No se pudo leer la lista de alumnos del grupo de esta materia.");
  if (padron.size === 0) {
    return fallo("El grupo de esta materia no tiene alumnos inscritos activos.");
  }

  const avisos = [...canon.avisos, ...conv.avisos];
  const ajenas = [...new Set(conv.filas.map((f) => f.curp).filter((c) => !padron.has(c)))];
  const filas = conv.filas.filter((f) => padron.has(f.curp));

  if (ajenas.length > 0) {
    // Se nombran, hasta cinco: «se omitieron 3 alumnos» no le dice al profesor
    // qué corregir en su archivo.
    const muestra = ajenas.slice(0, 5).join(", ");
    const resto = ajenas.length > 5 ? ` y ${ajenas.length - 5} más` : "";
    avisos.push(
      `${ajenas.length} CURP del archivo no están inscritas en este grupo y se omitieron: ${muestra}${resto}.`,
    );
  }
  if (filas.length === 0) {
    return fallo(
      "Ninguna CURP del archivo está inscrita en el grupo de esta materia. Puede que el archivo sea de otro grupo.",
    );
  }

  const r = await guardarCalificaciones(supabase, grupoMateriaId, filas, registradoPor);
  if (!r.ok) return fallo(r.error);
  // Los avisos van SIEMPRE, aunque haya ido bien: son las filas omitidas y las
  // notas fuera de rango. Un «listo» a secas dejaría al profesor creyendo que
  // subió filas que no subió.
  return { ok: true, escritas: r.dato.escritas, avisos };
}

/** Califica una actividad en pantalla, sin Excel. Misma tabla y misma clave de
 *  unicidad que la subida, así que las dos vías no se duplican entre sí. */
export async function actionCalificarActividad(datos: {
  grupoMateriaId: string;
  curp: string;
  actividadId: string;
  claveColumna: string;
  valor: number | null;
}): Promise<{ ok: true } | Fallo> {
  const g = await exigir("calificacion.subir");
  if (!g.ok || !g.sesion) return fallo("No autorizado.");
  if (!datos.grupoMateriaId || !datos.curp?.trim()) return fallo("Falta la materia o el alumno.");
  if (!datos.claveColumna?.trim()) return fallo("Falta el nombre de la columna.");

  const curp = datos.curp.trim().toUpperCase();
  const supabase = await createClient();

  const activa = await grupoMateriaActiva(supabase, datos.grupoMateriaId);
  if (activa === null) return fallo("Esa materia no existe en ningún grupo.");
  if (!activa) return fallo("Esta materia está desactivada en su grupo: no admite calificaciones.");

  // Mismo cerrojo que la subida: no se califica a quien no está en el grupo.
  const padron = await curpsDelGrupoMateria(supabase, datos.grupoMateriaId);
  if (!padron) return fallo("No se pudo verificar el grupo de esta materia.");
  if (!padron.has(curp)) {
    return fallo("Ese alumno no está inscrito en el grupo de esta materia.");
  }

  const r = await calificarActividad(supabase, {
    ...datos,
    curp,
    claveColumna: datos.claveColumna.trim(),
    registradoPor: g.sesion.profesorId ?? null,
  });
  return r.ok ? { ok: true } : fallo(r.error);
}

/* ── Expandir y reducir el volumen de materias (técnico) ────────────────── */

/**
 * Las parejas (grupo, materia) del ciclo OPERATIVO, activas e inactivas: es lo
 * que la pantalla del técnico necesita para dar de alta, desactivar, reactivar
 * y poner alias.
 *
 * El ciclo sale de `obtenerCicloOperativoGlobal`, nunca de un parámetro: así el
 * técnico no puede, por error o a propósito, gestionar las materias de un ciclo
 * cerrado desde esta pantalla.
 */
export async function actionListarParejasParaGestion(): Promise<
  { ok: true; parejas: ParejaParaGestion[] } | Fallo
> {
  const g = await exigir("materia.ver_catalogo");
  if (!g.ok) return fallo("No autorizado.");

  const supabase = await createClient();
  const operativo = await obtenerCicloOperativoGlobal(supabase);
  if (!operativo.ok || !operativo.periodo) {
    return fallo(operativo.error ?? "No hay un ciclo operativo definido.");
  }
  const parejas = await listarParejasDelPeriodo(supabase, String(operativo.periodo.id));
  if (!parejas) return fallo("No se pudo leer la lista de materias por grupo.");
  return { ok: true, parejas };
}

export async function actionAltaMateriaEnGrupo(
  grupoId: string,
  materiaId: string,
): Promise<{ ok: true; grupoMateriaId: string } | Fallo> {
  const g = await exigir("materia.activar_desactivar");
  if (!g.ok) return fallo("No autorizado.");
  if (!grupoId || !materiaId) return fallo("Falta el grupo o la materia.");

  const supabase = await createClient();
  const r = await altaMateriaEnGrupo(supabase, grupoId, materiaId);
  return r.ok ? { ok: true, grupoMateriaId: r.dato.grupoMateriaId } : fallo(r.error);
}

/**
 * Reducir el volumen es DESACTIVAR, nunca borrar: la fila conserva el historial
 * de notas, y un `delete` se lo llevaría por el `on delete cascade` de
 * `calificaciones` (R8).
 */
export async function actionCambiarEstadoMateriaEnGrupo(
  grupoMateriaId: string,
  activo: boolean,
): Promise<{ ok: true } | Fallo> {
  const g = await exigir("materia.activar_desactivar");
  if (!g.ok) return fallo("No autorizado.");
  if (!grupoMateriaId) return fallo("Falta la materia.");

  const supabase = await createClient();
  const r = await cambiarEstadoMateriaEnGrupo(supabase, grupoMateriaId, activo);
  return r.ok ? { ok: true } : fallo(r.error);
}

/** El alias por pareja (grupo, materia): «cómo se llama esta materia aquí». */
export async function actionGuardarAliasPorPareja(
  grupoMateriaId: string,
  nombreVisible: string,
): Promise<{ ok: true } | Fallo> {
  const g = await exigir("materia.editar_alias");
  if (!g.ok || !g.sesion) return fallo("No autorizado.");
  if (!grupoMateriaId) return fallo("Falta la materia.");

  const nombre = nombreVisible.trim();
  if (!nombre) return fallo("El alias no puede estar vacío.");

  const supabase = await createClient();
  const r = await guardarAlias(supabase, grupoMateriaId, nombre, g.sesion.matricula);
  return r.ok ? { ok: true } : fallo(r.error);
}

/* ── El puente, para las pantallas que aún manejan `idInterno` ──────────── */

/**
 * Traduce un `idInterno` (nombre de la tabla física) a `grupo_materia_id`.
 *
 * Existe para la TRANSICIÓN: deja que una pantalla que todavía maneja el nombre
 * de la tabla use el modelo nuevo sin reescribirla entera. No es el camino
 * deseable y no debería multiplicarse.
 */
export async function actionResolverGrupoMateria(
  tablaLegacy: string,
): Promise<{ grupoMateriaId: string } | null> {
  const g = await exigir("materia.ver_catalogo");
  if (!g.ok) return null;
  if (!tablaLegacy?.trim()) return null;

  const supabase = await createClient();
  const r = await grupoMateriaDesdeTablaLegacy(supabase, tablaLegacy);
  return r ? { grupoMateriaId: r.id } : null;
}
