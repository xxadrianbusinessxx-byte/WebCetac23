import {
  CAMPOS_PERSONALES_PRIMARIOS,
  type CampoPersonalPrimario,
} from "./etiquetas";
import type { EtiquetasPersonalesRow } from "./types";

const FOTO_PREFIX = "__FOTO__";

/**
 * @deprecated Identidad académica NO se resuelve desde ETIQUETAS PERSONALES
 * (filosofia.estructural §5): grado/grupo/carrera vienen del catálogo
 * (inscripciones_alumno → grupos → carreras). Esta función solo queda para el
 * fallback legacy temporal de asistencias (marcado @deprecated también).
 * Carrera escolar real (ignora URLs de foto guardadas por error en CARRERA).
 */
export function carreraEscolarDesdeEtiquetas(
  row: EtiquetasPersonalesRow | null | undefined,
): string {
  const c = row?.CARRERA?.trim() ?? "";
  if (!c || c.startsWith(FOTO_PREFIX) || c.includes("res.cloudinary.com")) {
    return "";
  }
  return c;
}

export type CampoInformacionPersonal = {
  clave: keyof EtiquetasPersonalesRow | "CURP";
  etiqueta: string;
  valor: string;
};

/**
 * Campos personales DEFINIDOS (fuente: ETIQUETAS PERSONALES).
 * GRADO/GRUPO/CARRERA quedan FUERA: son identidad académica del catálogo.
 * La lista proviene de CAMPOS_PERSONALES_PRIMARIOS (etiquetas.ts) para que la
 * UI editable y la presentación de solo lectura compartan la MISMA fuente.
 */
const ETIQUETAS_LABEL: Record<CampoPersonalPrimario, string> = {
  GENERO: "Género",
  CORREO: "Correo",
  CELULAR: "Celular",
  "TIPO DE SANGRE": "Tipo de sangre",
  ALERGIAS: "Alergias",
  LENTES: "Lentes",
  "ENFERMEDAD CRONICA": "Enfermedad crónica",
  "SALUD MENTAL": "Salud mental",
  "NECESIDAD PSICOLOGICA": "Necesidad psicológica",
  PESO: "Peso",
  TALLA: "Talla",
  VACUNACION: "Vacunación",
  EDAD: "Edad",
  ESTATURA: "Estatura",
};

const CAMPOS_ORDEN: { clave: CampoPersonalPrimario; etiqueta: string }[] =
  CAMPOS_PERSONALES_PRIMARIOS.map((clave) => ({
    clave,
    etiqueta: ETIQUETAS_LABEL[clave],
  }));

function valorCelda(
  row: EtiquetasPersonalesRow | null,
  clave: keyof EtiquetasPersonalesRow,
): string {
  if (!row) return "—";
  const v = row[clave];
  const t = v == null ? "" : String(v).trim();
  return t || "—";
}

/**
 * Campos de ETIQUETAS PERSONALES para mostrar en el perfil (solo lectura).
 * La identidad académica (grado/grupo/carrera) se muestra desde el catálogo.
 */
export function informacionPersonalDesdeEtiquetas(
  row: EtiquetasPersonalesRow | null,
): CampoInformacionPersonal[] {
  const base: CampoInformacionPersonal[] = [
    { clave: "CURP", etiqueta: "CURP", valor: row?.CURP?.trim() || "—" },
    ...CAMPOS_ORDEN.map(({ clave, etiqueta }) => ({
      clave,
      etiqueta,
      valor: valorCelda(row, clave),
    })),
  ];
  return base;
}

/**
 * @deprecated Etiquetas EMPTY1-6 legacy (ETIQUETAS PERSONALES). Reemplazadas
 * funcionalmente por `alumno_etiquetas` (módulo etiquetas-dinamicas). Se
 * conserva solo por compatibilidad de lectura durante la transición.
 */
export function etiquetasVaciasDesdeFila(
  row: EtiquetasPersonalesRow | null,
): { titulo: string; valor: string }[] {
  if (!row) return [];
  const out: { titulo: string; valor: string }[] = [];
  for (let i = 0; i < 3; i++) {
    const tituloKey = `EMPTY${i + 1}` as keyof EtiquetasPersonalesRow;
    const valorKey = `EMPTY${i + 4}` as keyof EtiquetasPersonalesRow;
    const titulo = String(row[tituloKey] ?? "").trim();
    const valor = String(row[valorKey] ?? "").trim();
    if (titulo || valor) {
      out.push({ titulo: titulo || `Etiqueta ${i + 1}`, valor: valor || "—" });
    }
  }
  return out;
}
