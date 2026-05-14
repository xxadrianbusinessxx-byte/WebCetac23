import { timingSafeEqual } from "node:crypto";
import type { PortalRole } from "./types";

/**
 * Credenciales de demostración (servidor). Sustituir por consulta a BD / Supabase.
 * Matrícula sin distinguir mayúsculas; contraseña sí es sensible.
 */
const DEMO: ReadonlyArray<{ matricula: string; clave: string; rol: PortalRole }> = [
  { matricula: "ALU001", clave: "demo123", rol: "alumno" },
  { matricula: "MAE001", clave: "demo123", rol: "maestro" },
  { matricula: "DIR001", clave: "demo123", rol: "directivo" },
];

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function validatePortalCredentials(
  matriculaRaw: string,
  clave: string
): { matricula: string; rol: PortalRole } | null {
  const matricula = matriculaRaw.trim().toUpperCase();
  if (!matricula || !clave) return null;
  for (const row of DEMO) {
    if (row.matricula.toUpperCase() === matricula && safeEqual(row.clave, clave)) {
      return { matricula: row.matricula, rol: row.rol };
    }
  }
  return null;
}
