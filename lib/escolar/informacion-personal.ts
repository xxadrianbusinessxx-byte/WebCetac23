import type { EtiquetasPersonalesRow } from "./types";

const FOTO_PREFIX = "__FOTO__";

/** Carrera escolar real (ignora URLs de foto guardadas por error en CARRERA). */
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

const CAMPOS_ORDEN: { clave: keyof EtiquetasPersonalesRow; etiqueta: string }[] =
  [
    { clave: "GENERO", etiqueta: "Género" },
    { clave: "GRADO", etiqueta: "Grado" },
    { clave: "GRUPO", etiqueta: "Grupo" },
    { clave: "CARRERA", etiqueta: "Carrera" },
    { clave: "CORREO", etiqueta: "Correo" },
    { clave: "CELULAR", etiqueta: "Celular" },
    { clave: "TIPO DE SANGRE", etiqueta: "Tipo de sangre" },
    { clave: "ALERGIAS", etiqueta: "Alergias" },
    { clave: "LENTES", etiqueta: "Lentes" },
    { clave: "ENFERMEDAD CRONICA", etiqueta: "Enfermedad crónica" },
    { clave: "SALUD MENTAL", etiqueta: "Salud mental" },
    { clave: "NECESIDAD PSICOLOGICA", etiqueta: "Necesidad psicológica" },
    { clave: "PESO", etiqueta: "Peso" },
    { clave: "TALLA", etiqueta: "Talla" },
    { clave: "VACUNACION", etiqueta: "Vacunación" },
  ];

function valorCelda(
  row: EtiquetasPersonalesRow | null,
  clave: keyof EtiquetasPersonalesRow,
): string {
  if (!row) return "—";
  if (clave === "CARRERA") {
    const c = carreraEscolarDesdeEtiquetas(row);
    return c || "—";
  }
  const v = row[clave];
  const t = v == null ? "" : String(v).trim();
  return t || "—";
}

/** Campos de ETIQUETAS PERSONALES para mostrar en el perfil (solo lectura). */
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

/** Etiquetas vacías personalizadas (EMPTY1–3 título, EMPTY4–6 valor). */
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
