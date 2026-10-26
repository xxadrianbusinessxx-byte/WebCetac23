/**
 * etiquetas-exportar-puro.ts — MÓDULO PURO. Qué columnas lleva cada hoja que se
 * baja del alumnado y en qué orden. 2026-10-25.
 *
 * Nace con el rol Servicio Escolar: hasta hoy `ETIQUETAS PERSONALES` solo se
 * podía IMPORTAR (`importar-etiquetas.ts`); no había forma de sacar lo que ya
 * estaba guardado.
 *
 * Por qué DOS hojas y no una. La tabla mezcla dos cosas que no se piden juntas:
 * datos de contacto (correo, celular, edad) y situación médica (tipo de sangre,
 * alergias, salud mental…). Separarlas deja pedir la primera sin arrastrar la
 * segunda, que es la que de verdad pesa si la hoja se queda en un escritorio.
 *
 * Las seis columnas `EMPTY1..EMPTY6` de la tabla no salen en ninguna hoja: son
 * restos de la importación original y nunca han guardado nada.
 *
 * La identidad (nombre, grado, grupo, carrera) NO se toma de esta tabla aunque
 * tenga columnas con esos nombres: viene del padrón (`roster-ciclo.ts`), que es
 * la fuente única. Las de aquí son una foto vieja de la importación.
 */

export type HojaAlumnado = "etiquetas" | "medica";

/** Columna de `ETIQUETAS PERSONALES` → encabezado de la hoja. */
type Columna = { campo: string; encabezado: string };

/** Lo que identifica al alumno en cualquiera de las dos hojas. */
const IDENTIDAD: readonly string[] = ["CURP", "ALUMNO", "NUMERO DE CONTROL", "GRADO", "GRUPO", "CARRERA"];

const COLUMNAS_ETIQUETAS: readonly Columna[] = [
  { campo: "GENERO", encabezado: "GENERO" },
  { campo: "EDAD", encabezado: "EDAD" },
  { campo: "CORREO", encabezado: "CORREO" },
  { campo: "CELULAR", encabezado: "CELULAR" },
  { campo: "VACUNACION", encabezado: "VACUNACION" },
  { campo: "COMENTARIO PERSONAL", encabezado: "COMENTARIO PERSONAL" },
];

const COLUMNAS_MEDICA: readonly Columna[] = [
  { campo: "TIPO DE SANGRE", encabezado: "TIPO DE SANGRE" },
  { campo: "ALERGIAS", encabezado: "ALERGIAS" },
  { campo: "ENFERMEDAD CRONICA", encabezado: "ENFERMEDAD CRONICA" },
  { campo: "LENTES", encabezado: "LENTES" },
  { campo: "SALUD MENTAL", encabezado: "SALUD MENTAL" },
  { campo: "NECESIDAD PSICOLOGICA", encabezado: "NECESIDAD PSICOLOGICA" },
  { campo: "PESO", encabezado: "PESO" },
  { campo: "TALLA", encabezado: "TALLA" },
  { campo: "ESTATURA", encabezado: "ESTATURA" },
];

export function columnasDeHoja(hoja: HojaAlumnado): readonly Columna[] {
  return hoja === "medica" ? COLUMNAS_MEDICA : COLUMNAS_ETIQUETAS;
}

/** Los campos de la tabla que hay que pedir para esa hoja (sin la identidad). */
export function camposDeHoja(hoja: HojaAlumnado): string[] {
  return columnasDeHoja(hoja).map((c) => c.campo);
}

/** Encabezados completos: identidad + los de la hoja. */
export function encabezadosDeHoja(hoja: HojaAlumnado): string[] {
  return [...IDENTIDAD, ...columnasDeHoja(hoja).map((c) => c.encabezado)];
}

/** Nombre del archivo, con el ciclo dentro para que no se confundan dos descargas. */
export function nombreArchivoHoja(hoja: HojaAlumnado, ciclo: string | null): string {
  const sufijo = (ciclo ?? "ciclo").replace(/[^\w-]+/g, "-");
  return `${hoja === "medica" ? "situacion-medica" : "etiquetas"}-${sufijo}.xlsx`;
}

/** Rótulo de la hoja dentro del libro y en los mensajes de la pantalla. */
export function rotuloHoja(hoja: HojaAlumnado): string {
  return hoja === "medica" ? "Situación médica" : "Etiquetas";
}

export type IdentidadAlumno = {
  curp: string;
  alumno: string;
  numeroControl: string;
  grado: string;
  grupo: string;
  carrera: string;
};

/**
 * Una fila de la hoja: identidad + los valores de la tabla, en el orden de los
 * encabezados. Lo que no está guardado sale como celda vacía.
 */
export function filaDeHoja(
  hoja: HojaAlumnado,
  id: IdentidadAlumno,
  valores: Record<string, unknown> | null | undefined,
): string[] {
  const base = [id.curp, id.alumno, id.numeroControl, id.grado, id.grupo, id.carrera];
  const resto = columnasDeHoja(hoja).map((c) => {
    const v = valores?.[c.campo];
    return v == null ? "" : String(v).trim();
  });
  return [...base, ...resto];
}

/** Cuántas celdas de la hoja (sin contar la identidad) traen algo. */
export function celdasConDato(hoja: HojaAlumnado, filas: string[][]): number {
  const desde = IDENTIDAD.length;
  let n = 0;
  for (const f of filas) {
    for (let i = desde; i < f.length; i++) if ((f[i] ?? "").trim()) n++;
  }
  return n;
}
