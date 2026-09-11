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

export type EstadoApartado = "activo" | "apagado";

/** Por qué está apagado. Cambia el texto que ve el usuario, y no son
 *  intercambiables: uno explica una dependencia real, el otro una decisión. */
export type RazonApagado = "sin-datos" | "decision";

export const TEXTO_APAGADO: Record<RazonApagado, string> = {
  "sin-datos": "Disponible cuando se defina su estructura de datos.",
  decision: "Disponible próximamente.",
};

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

// ── Alumno y tutor comparten mapa ──────────────────────────────────────────
// El tutor añade un selector de alumno vinculado que fija el alcance de toda la
// navegación, pero los apartados son los mismos: ve lo de su hijo, no otra cosa.
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
    off("actividades", "Actividades y tareas", "sin-datos"),
    act("calificacion", "Calificación"),
    off("recursos", "Recursos", "sin-datos"),
  ],
};

const CALENDARIO_ALUMNO: Pestana = {
  id: "calendario",
  label: "Calendario",
  apartados: [
    act("calendario-escolar", "Calendario escolar"),
    act("horario-escolar", "Horario escolar"),
    act("asistencia", "Asistencia", ["Calendario visual", "Datos crudos"]),
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
    off("citas", "Citas", "sin-datos", [
      "Configurar citas",
      "Citas pendientes",
      "Citas programadas",
    ]),
    off("reportes", "Reportes", "sin-datos", ["Crea un reporte", "Reportes"]),
    off("recursos-administrativos", "Recursos administrativos", "sin-datos", [
      "Constancias",
      "Constancias programadas",
      "Configurar cita de constancia",
    ]),
    act("alumnos-tutores", "Alumnos / Tutores"),
    off("buzon", "Buzón", "sin-datos", ["Buzón de quejas", "Buzón (comentarios)"]),
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
    act("noticias", "Noticias", ["Publicadas", "Nueva"]),
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

/** Primer apartado navegable de una pestaña: a dónde entra el usuario al
 *  pulsarla. Si todos están apagados devuelve `null` y la pestaña muestra su
 *  estado en vez de contenido. */
export function apartadoInicial(rol: PortalRole | null, idPestana: string): Apartado | null {
  return pestana(rol, idPestana)?.apartados.find((a) => a.estado === "activo") ?? null;
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

/** Texto a mostrar en un apartado apagado. `null` si está activo. */
export function textoApagado(a: Apartado): string | null {
  if (a.estado !== "apagado") return null;
  return TEXTO_APAGADO[a.razon ?? "sin-datos"];
}

/** Todos los apartados apagados de un rol. Para el registro de lo pendiente. */
export function apartadosApagados(rol: PortalRole): { pestana: string; apartado: Apartado }[] {
  const out: { pestana: string; apartado: Apartado }[] = [];
  for (const p of pestanasDe(rol)) {
    for (const a of p.apartados) if (a.estado === "apagado") out.push({ pestana: p.id, apartado: a });
  }
  return out;
}
