/**
 * contenido-tecnico.ts — MÓDULO PURO. Qué pieza REAL va en cada hueco del shell
 * Océano para el rol técnico.
 *
 * Mismo contrato que `contenido-alumno.ts`: solo el emparejamiento
 * hueco → pieza, con los identificadores del mapa (`mapa-navegacion.ts`).
 * Sin datos, sin base de datos, sin permisos. Quien pinta traduce el id de
 * pieza a un componente React.
 *
 * ── Por qué el técnico es el rol más barato ────────────────────────────────
 * Todas sus piezas YA EXISTEN y funcionan. Hoy viven apiladas en una sola
 * página — `app/configuracion/page.tsx` monta seis paneles uno debajo de otro
 * con guardas `puede(...)` — y el rediseño solo las reparte en los tres
 * niveles de navegación. Ni un modelo de datos nuevo, ni una capacidad nueva.
 *
 * ── Lo que el técnico NO ve, y por qué no está aquí ────────────────────────
 * No tiene ninguna capacidad de `calificacion.*`, `asistencia.*` ni
 * `justificacion.*`. Esos apartados no son «apagados» para él: son AUSENCIA en
 * el mapa. Si alguno apareciera en este archivo, sería un bug — el mapa no los
 * ofrece y el emparejamiento no debe inventarlos.
 */

/** Piezas reales que ya existen como componente y se reubican en el shell. */
export type PiezaTecnico =
  | "ciclo-configurador"
  | "ciclo-lista"
  | "calendario-escolar-admin"
  | "horario-escolar-admin"
  | "deshacer-paso"
  | "materias-config"
  | "asignaciones-profesor"
  | "roster-alumnos"
  | "tutores"
  | "profesores-credenciales"
  | "documentos"
  | "mensajes-internos"
  | "portada-medios";

/** Clave = `idPestana/idApartado`, tal cual los devuelve el mapa. */
const HUECOS: Readonly<Record<string, PiezaTecnico>> = {
  // Ciclo escolar — el configurador de 7 pasos YA es un conmutador de modo:
  // se convierte en la barra de modo (nivel 3), no se reescribe.
  "ciclo-escolar/configurador": "ciclo-configurador",
  "ciclo-escolar/ciclos": "ciclo-lista",
  "ciclo-escolar/calendario-escolar": "calendario-escolar-admin",
  "ciclo-escolar/horario": "horario-escolar-admin",
  "ciclo-escolar/deshacer": "deshacer-paso",

  // Catálogo
  "catalogo/materias": "materias-config",
  "catalogo/asignaciones": "asignaciones-profesor",

  // Personas
  "personas/alumnos": "roster-alumnos",
  "personas/tutores": "tutores",
  "personas/profesores": "profesores-credenciales",

  // Contenido — Documentos ENCENDIDO (2026-09-17): el panel institucional ya
  // existía, con sus tablas y su suite; lo que faltaba era montarlo.
  "contenido/documentos": "documentos",

  // Configuración de la portada pública (PROMPT N): sustituye al apartado
  // «Noticias» que estuvo apagado aquí. La misma pieza que el directivo.
  "configuracion/video-imagenes": "portada-medios",

  // Mensajería interna, el único sitio donde el técnico coincide con el resto
  // del personal.
  "mensajes/bandeja": "mensajes-internos",
};

/** Pieza que corresponde a un hueco, o `null` si ese hueco no tiene pieza. */
export function piezaDe(idPestana: string, idApartado: string): PiezaTecnico | null {
  return HUECOS[`${idPestana}/${idApartado}`] ?? null;
}

/** Huecos con pieza real. Para el registro de lo reubicado. */
export function huecosConPieza(): string[] {
  return Object.keys(HUECOS);
}
