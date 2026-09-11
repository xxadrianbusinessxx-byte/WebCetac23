/**
 * mapa-navegacion.ts — MÓDULO PURO. El mapa de los tres niveles de navegación
 * del rediseño Océano, para los cinco roles.
 *
 * La gramática del diseño tiene tres niveles, no dos:
 *   1. Barra superior  — pestañas globales. VARÍAN POR ROL.
 *   2. Sidebar         — apartados de la pestaña activa.
 *   3. Barra de modo   — sub-vistas del apartado, arriba a la derecha.
 *
 * Este módulo es DATO, no interfaz: el shell lo consume y pinta. Tenerlo escrito
 * a mano en el JSX significaría que cambiar un apartado obliga a tocar React, y
 * que nadie puede verificar el mapa sin arrancar la aplicación.
 *
 * ── Tres estados, y la diferencia importa ──────────────────────────────────
 *   activo   — responde.
 *   apagado  — se dibuja, no navega, con texto explícito. Existe para ese rol
 *              y le llegará.
 *   ausente  — NO está en este mapa. Lo denegado por capacidad no se dibuja.
 *
 * Enseñar a un técnico una pestaña «Boleta» apagada le promete algo que nunca
 * tendrá: el técnico no tiene ninguna capacidad de `calificacion.*`. Por eso
 * «denegado» no es un estado de este módulo — es una ausencia.
 *
 * ── Lo que este módulo NO hace ─────────────────────────────────────────────
 * No decide permisos. La autorización real vive en `lib/auth/permisos.ts` y se
 * exige en cada Server Action con `exigir()`. Este mapa dice qué se DIBUJA;
 * la action dice qué se PUEDE. Si divergen, manda la action y es un bug del
 * mapa (regla 4 del PROMPT-3: un botón visible que el servidor rechaza).
 */
import type { PortalRole } from "../auth/types";

/**
 * TRES estados, no dos. La distinción entre los dos últimos es la que pidió el
 * responsable el 2026-09-11 y cambia qué ve el usuario:
 *
 *   activo   — responde de verdad: lee y escribe contra el servidor.
 *   maqueta  — SE NAVEGA y se ve la pantalla tal como está dibujada en Figma,
 *              pero NO opera: los botones no hacen nada y los modos cambian la
 *              vista sin tocar el backend. Es visualización, no simulación —
 *              no inventa datos ni finge que guardó.
 *   apagado  — solo se dibuja el rótulo del apartado, deshabilitado. Se usa
 *              cuando NO HAY NADA QUE ENSEÑAR: el diseño no dibujó esa
 *              pantalla, así que no hay maqueta posible.
 *
 * Por qué importa la diferencia entre `maqueta` y `apagado`: el criterio no es
 * «¿tiene backend?» sino «¿existe el frame en Figma?». Citas, Reportes,
 * Constancias, Buzón y Actividades están dibujados por completo y se pueden
 * enseñar; Recursos, Chat y Sesiones programadas aparecen como rótulo en el
 * sidebar y ningún frame muestra su contenido. Inventarles una pantalla sería
 * diseñar, no migrar.
 */
export type EstadoApartado = "activo" | "maqueta" | "apagado";

/** Por qué está apagado. Cambia el texto que ve el usuario, y no son
 *  intercambiables: uno explica una dependencia real, el otro una decisión. */
export type RazonApagado = "sin-datos" | "decision";

export const TEXTO_APAGADO: Record<RazonApagado, string> = {
  "sin-datos": "Disponible cuando se defina su estructura de datos.",
  decision: "Disponible próximamente.",
};

/** Aviso que acompaña a toda maqueta. No se oculta: quien la ve tiene que
 *  saber que lo que pulse no va a guardar nada. */
export const TEXTO_MAQUETA =
  "Vista previa del diseño. Los controles todavía no operan: falta estructurar sus datos.";

export type Apartado = {
  id: string;
  label: string;
  estado: EstadoApartado;
  /** Solo cuando `estado === "apagado"`. */
  razon?: RazonApagado;
  /** Nivel 3. Lista vacía = el apartado no tiene sub-vistas. */
  modos: string[];
};

export type Pestana = {
  id: string;
  label: string;
  apartados: Apartado[];
};

const act = (id: string, label: string, modos: string[] = []): Apartado => ({
  id,
  label,
  estado: "activo",
  modos,
});

const off = (
  id: string,
  label: string,
  razon: RazonApagado,
  modos: string[] = [],
): Apartado => ({ id, label, estado: "apagado", razon, modos });

/** Maqueta: hay frame en Figma, así que se enseña. Navega y no opera. */
const maq = (id: string, label: string, modos: string[] = []): Apartado => ({
  id,
  label,
  estado: "maqueta",
  modos,
});

// ── Alumno y tutor comparten mapa ──────────────────────────────────────────
// El tutor añade un selector de alumno vinculado que fija el alcance de toda la
// navegación, pero los apartados son los mismos: ve lo de su hijo, no otra cosa.
//
// HUECO CONOCIDO (verificado 2026-09-11, bloquea retirar /tutor).
// `actionListarMensajesDelTutor` devuelve los mensajes dirigidos AL TUTOR
// —`destinatario_tipo = "tutor"`, con marca de leído— de TODOS sus alumnos a la
// vez. Es una bandeja personal, y este mapa no tiene sitio para ella: todos sus
// apartados están dentro del alcance de UN alumno seleccionado, y la bandeja
// cruza ese alcance.
// No se resuelve añadiéndola como modo de Notificaciones: mezclaría dos ámbitos
// —lo de este hijo y lo mío— en el mismo apartado. Necesita decisión de diseño:
// un apartado propio del tutor, o un nivel por encima del selector. Hasta
// entonces, `/tutor` no se retira.
const PERFIL_ALUMNO: Pestana = {
  id: "perfil",
  label: "Perfil",
  apartados: [
    act("notificaciones", "Notificaciones", ["Comentarios", "Justificaciones"]),
    act("informacion-personal", "Información personal"),
    act("seguimiento-semestral", "Seguimiento semestral"),
    act("estatus-academico", "Estatus académico"),
    act("seguimiento-medico", "Seguimiento médico"),
    off("sesiones-programadas", "Sesiones programadas", "sin-datos"),
  ],
};

const MATERIAS_ALUMNO: Pestana = {
  id: "materias",
  label: "Materias",
  apartados: [
    // MAQUETA: el diseño dibuja las dos pantallas —la lista con sus tarjetas
    // VENCIDA/ACTIVA y el detalle con descripción, dropzone y «Subir actividad»
    // más el peso (20 %)—. Se enseñan; subir no hace nada todavía.
    maq("actividades", "Actividades y tareas", ["Lista", "Detalle"]),
    act("calificacion", "Calificación"),
    // Recursos aparece en el sidebar de los tres roles y NINGÚN frame dibuja su
    // contenido. No hay maqueta posible sin inventarla.
    off("recursos", "Recursos", "sin-datos"),
  ],
};

const CALENDARIO_ALUMNO: Pestana = {
  id: "calendario",
  label: "Calendario",
  apartados: [
    act("calendario-escolar", "Calendario escolar"),
    act("horario-escolar", "Horario escolar"),
    // Fase 3.1 — este apartado NO tiene sub-vistas: muestra la TABLA de datos
    // crudos de asistencia. El calendario visual vive, único, en «Calendario
    // escolar». Tenerlo además aquí como modo era un error del mapa (dos
    // entradas a la misma vista), no del cableado.
    act("asistencia", "Asistencia"),
  ],
};

const CHAT: Pestana = {
  id: "chat",
  label: "Chat",
  apartados: [off("chat", "Chat", "sin-datos")],
};

// ── Profesor ───────────────────────────────────────────────────────────────
// La pestaña Materias abre en el catálogo con selector de ámbito y buscador;
// estos apartados aparecen al seleccionar una materia.
const MATERIAS_DOCENTE: Pestana = {
  id: "materias",
  label: "Materias",
  apartados: [
    act("calificaciones", "Calificaciones", ["Avance", "Configuración de columnas"]),
    act("asistencia", "Asistencia", ["Descargar plantilla", "Previsualizar cambios"]),
    off("recursos", "Recursos", "sin-datos"),
  ],
};

const CALENDARIO_DOCENTE: Pestana = {
  id: "calendario-asistencias",
  label: "Calendario/Asistencias",
  apartados: [
    act("asistencias", "Asistencias"),
    act("calendario-escolar", "Calendario escolar"),
  ],
};

// ── Directivo: lo del profesor + Grupos/Boleta + Administración escolar ────
const GRUPOS_BOLETA: Pestana = {
  id: "grupos-boleta",
  label: "Grupos/Boleta",
  apartados: [
    act("boleta", "Boleta", ["Descargar plantilla", "Previsualizar cambios"]),
    act("grupo", "Grupo"),
  ],
};

const ADMINISTRACION: Pestana = {
  id: "administracion",
  label: "Administración escolar",
  apartados: [
    // Los cuatro son MAQUETA: el archivo de Figma los dibuja por completo —once
    // frames de Administración escolar— con sus tarjetas, sus botones y sus
    // barras de modo. Se enseñan tal cual; Aceptar, Rechazar y Guardar no
    // hacen nada porque las cuatro entidades no existen en Supabase.
    maq("citas", "Citas", ["Configurar citas", "Citas pendientes", "Citas programadas"]),
    maq("reportes", "Reportes", ["Crea un reporte", "Reportes"]),
    maq("recursos-administrativos", "Recursos administrativos", [
      "Constancias",
      "Constancias programadas",
      "Configurar cita de constancia",
    ]),
    act("alumnos-tutores", "Alumnos / Tutores"),
    maq("buzon", "Buzón", ["Buzón de quejas", "Buzón (comentarios)"]),
  ],
};

// ── Técnico: configura la estructura; no ve contenido académico ────────────
const CICLO_ESCOLAR: Pestana = {
  id: "ciclo-escolar",
  label: "Ciclo escolar",
  apartados: [
    act("configurador", "Configurador", [
      "1 · Datos",
      "2 · Académico",
      "3 · Alumnos",
      "4 · Evaluación",
      "5 · Calendario",
      "6 · Horario",
      "7 · Validación",
    ]),
    act("ciclos", "Ciclos", ["Activos", "Histórico", "Clonar"]),
    act("calendario-escolar", "Calendario escolar", ["Días", "Base del periodo"]),
    act("horario", "Horario", ["Descargar plantilla", "Importar"]),
    act("deshacer", "Deshacer", ["Por paso"]),
  ],
};

const CATALOGO: Pestana = {
  id: "catalogo",
  label: "Catálogo",
  apartados: [
    act("materias", "Materias", ["Catálogo", "Aliases en volumen", "Visibilidad"]),
    act("asignaciones", "Asignaciones", ["Profesor → materia", "Desactivadas"]),
  ],
};

const PERSONAS: Pestana = {
  id: "personas",
  label: "Personas",
  apartados: [
    act("alumnos", "Alumnos", [
      "Roster",
      "Baja y restauración",
      "Etiquetas",
      "Estatus",
      "Inscripciones",
    ]),
    act("tutores", "Tutores", ["Lista", "Crear", "Generar automáticos"]),
    act("profesores", "Profesores", ["Credenciales", "Forzar cambio de clave"]),
  ],
};

const CONTENIDO: Pestana = {
  id: "contenido",
  label: "Contenido",
  apartados: [
    // El código de documentos existe y funciona (documentos-panel.tsx,
    // actions/documentos.ts, cinco capacidades concedidas). Apagarlo es una
    // decisión de interfaz, reversible. NO se borra ni se desconecta.
    off("documentos", "Documentos", "decision"),
    // El sistema de noticias (Cloudinary) esta DESACTIVADO: `eventos-inicio.tsx`
    // lo declara y `actionPublicarNoticiaInicio` no la llama ningun componente.
    // La capacidad `noticia.publicar` sigue concedida, pero no hay superficie
    // que la ejerza. Apagado por decision, como Documentos: el codigo existe.
    off("noticias", "Noticias", "decision"),
  ],
};

/** El mapa. Una pestaña ausente para un rol es una pestaña que ese rol NO ve. */
const MAPA: Record<PortalRole, Pestana[]> = {
  alumno: [PERFIL_ALUMNO, MATERIAS_ALUMNO, CALENDARIO_ALUMNO, CHAT],
  tutor: [PERFIL_ALUMNO, MATERIAS_ALUMNO, CALENDARIO_ALUMNO, CHAT],
  maestro: [MATERIAS_DOCENTE, CALENDARIO_DOCENTE],
  directivo: [MATERIAS_DOCENTE, GRUPOS_BOLETA, CALENDARIO_DOCENTE, ADMINISTRACION],
  tecnico: [CICLO_ESCOLAR, CATALOGO, PERSONAS, CONTENIDO],
};

/** Pestañas visibles para un rol. Sin sesión, ninguna. */
export function pestanasDe(rol: PortalRole | null): Pestana[] {
  if (!rol) return [];
  return MAPA[rol] ?? [];
}

export function pestana(rol: PortalRole | null, idPestana: string): Pestana | null {
  return pestanasDe(rol).find((p) => p.id === idPestana) ?? null;
}

export function apartado(
  rol: PortalRole | null,
  idPestana: string,
  idApartado: string,
): Apartado | null {
  return pestana(rol, idPestana)?.apartados.find((a) => a.id === idApartado) ?? null;
}

/**
 * ¿Se puede entrar a este apartado? Activo y maqueta sí; apagado no.
 * Es la única pregunta que debe hacerse el shell para decidir si navega: si
 * compara contra `"activo"` a mano, las maquetas dejan de ser alcanzables.
 */
export function esNavegable(a: Apartado | null): boolean {
  return a?.estado === "activo" || a?.estado === "maqueta";
}

/**
 * Primer apartado navegable de una pestaña: a dónde entra el usuario al
 * pulsarla. Prefiere uno ACTIVO sobre una maqueta — entrar a lo que funciona
 * antes que a lo que solo se enseña—, y solo cae a la maqueta si no hay
 * ninguno activo. `null` = la pestaña no tiene ninguno navegable.
 */
export function apartadoInicial(rol: PortalRole | null, idPestana: string): Apartado | null {
  const aps = pestana(rol, idPestana)?.apartados ?? [];
  return aps.find((a) => a.estado === "activo") ?? aps.find((a) => a.estado === "maqueta") ?? null;
}

/**
 * Orden del sidebar con el apartado activo en primera posición.
 * Patrón confirmado en los once frames de Administración escolar: el sidebar no
 * tiene orden fijo, el ítem activo sube arriba.
 */
export function ordenSidebar(apartados: readonly Apartado[], idActivo: string): Apartado[] {
  const activo = apartados.find((a) => a.id === idActivo);
  if (!activo) return [...apartados];
  return [activo, ...apartados.filter((a) => a.id !== idActivo)];
}

/** Texto a mostrar en un apartado apagado. `null` si no lo está. */
export function textoApagado(a: Apartado): string | null {
  if (a.estado !== "apagado") return null;
  return TEXTO_APAGADO[a.razon ?? "sin-datos"];
}

/** Aviso de una maqueta. `null` si no lo es. Nunca se oculta: quien la usa
 *  tiene que saber que lo que pulse no guarda. */
export function textoMaqueta(a: Apartado): string | null {
  return a.estado === "maqueta" ? TEXTO_MAQUETA : null;
}

/** Apartados de un rol en un estado dado. Para el registro de lo pendiente. */
function apartadosEn(
  rol: PortalRole,
  estado: EstadoApartado,
): { pestana: string; apartado: Apartado }[] {
  const out: { pestana: string; apartado: Apartado }[] = [];
  for (const p of pestanasDe(rol)) {
    for (const a of p.apartados) if (a.estado === estado) out.push({ pestana: p.id, apartado: a });
  }
  return out;
}

export function apartadosApagados(rol: PortalRole) {
  return apartadosEn(rol, "apagado");
}

/** Lo que se enseña pero no opera. Es la lista de lo que falta estructurar. */
export function apartadosMaqueta(rol: PortalRole) {
  return apartadosEn(rol, "maqueta");
}
