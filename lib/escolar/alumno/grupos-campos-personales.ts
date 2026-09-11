/**
 * grupos-campos-personales.ts — MÓDULO PURO. Reparte los campos personales del
 * alumno en los dos apartados que pide el rediseño Océano: «Información
 * personal» y «Seguimiento médico».
 *
 * NO crea campos ni toca el esquema. Los catorce campos ya existen como
 * columnas ESTRUCTURADAS de `EtiquetasPersonalesRow` (ver `etiquetas.ts`
 * §CAMPOS_PERSONALES_PRIMARIOS) y ya tienen etiquetas amigables en
 * `informacion-personal.ts`. Lo único que faltaba era decidir cuál va en qué
 * pantalla, y esa decisión es esto.
 *
 * `CAMPOS_PERSONALES_PRIMARIOS` NO se modifica: los grupos se DERIVAN de ella.
 * Así, si algún día se añade un campo allí, este módulo falla en compilación
 * (`GRUPO_INCOMPLETO` de abajo) en vez de ignorarlo en silencio.
 */
import {
  CAMPOS_PERSONALES_PRIMARIOS,
  type CampoPersonalPrimario,
} from "./etiquetas";

/** Identidad y contacto. Lo que el alumno reconoce como «sus datos». */
export const CAMPOS_INFORMACION_PERSONAL = [
  "GENERO",
  "CORREO",
  "CELULAR",
  "EDAD",
] as const satisfies readonly CampoPersonalPrimario[];

/**
 * Salud. Son DATOS SENSIBLES: separarlos no es cosmético, es lo que permite que
 * una pantalla los muestre y otra no, y que el alcance por rol se razone sobre
 * un conjunto acotado en vez de sobre los catorce campos mezclados.
 */
export const CAMPOS_SEGUIMIENTO_MEDICO = [
  "TIPO DE SANGRE",
  "ALERGIAS",
  "LENTES",
  "ENFERMEDAD CRONICA",
  "SALUD MENTAL",
  "NECESIDAD PSICOLOGICA",
  "PESO",
  "TALLA",
  "ESTATURA",
  "VACUNACION",
] as const satisfies readonly CampoPersonalPrimario[];

export type GrupoCampoPersonal = "personal" | "medico";

const MEDICOS: ReadonlySet<string> = new Set(CAMPOS_SEGUIMIENTO_MEDICO);

/** ¿En qué apartado se muestra este campo? */
export function grupoDeCampo(campo: CampoPersonalPrimario): GrupoCampoPersonal {
  return MEDICOS.has(campo) ? "medico" : "personal";
}

/** Los campos de un apartado, en el orden en que se presentan. */
export function camposDeGrupo(grupo: GrupoCampoPersonal): readonly CampoPersonalPrimario[] {
  return grupo === "medico" ? CAMPOS_SEGUIMIENTO_MEDICO : CAMPOS_INFORMACION_PERSONAL;
}

/**
 * Campos de `CAMPOS_PERSONALES_PRIMARIOS` que no están en ningún grupo.
 *
 * Debe ser SIEMPRE vacío. Existe para que la suite lo verifique: si alguien
 * añade un campo a la constante original y olvida repartirlo, el campo
 * desaparecería de la interfaz sin error — el alumno dejaría de poder rellenar
 * un dato y nadie se enteraría. Esta función convierte ese silencio en un fallo.
 */
export function camposSinGrupo(): CampoPersonalPrimario[] {
  const repartidos = new Set<string>([
    ...CAMPOS_INFORMACION_PERSONAL,
    ...CAMPOS_SEGUIMIENTO_MEDICO,
  ]);
  return CAMPOS_PERSONALES_PRIMARIOS.filter((c) => !repartidos.has(c));
}

/** Campos repartidos en más de un grupo. También debe ser siempre vacío. */
export function camposDuplicados(): CampoPersonalPrimario[] {
  const personal = new Set<string>(CAMPOS_INFORMACION_PERSONAL);
  return CAMPOS_SEGUIMIENTO_MEDICO.filter((c) => personal.has(c));
}
