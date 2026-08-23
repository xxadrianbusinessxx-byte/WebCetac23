/**
 * Tipos y funciones PURAS del dominio de TUTORES/PADRES (Bloque 6A).
 *
 * Este archivo NO importa `node:crypto` ni ninguna dependencia de servidor.
 * Es seguro importarlo desde Client Components (solo tipos y funciones puras).
 *
 * Las funciones que usan scrypt/hash viven en `lib/escolar/tutores.ts`
 * (exclusivo de servidor, con `import "server-only"`).
 */

export type TutorRow = {
  id: string;
  clave_tutor: string;
  nombre: string | null;
  apellidos: string | null;
  curp: string | null;
  telefono: string | null;
  correo: string | null;
  usuario: string | null;
  password_hash: string | null;
  debe_cambiar_credenciales: boolean;
  activo: boolean;
  created_at: string;
  updated_at: string;
};

export type TutorAlumnoRow = {
  id: string;
  tutor_id: string;
  curp_alumno: string;
  tipo_relacion: "principal" | "secundario";
  activo: boolean;
  created_at: string;
  updated_at: string;
};

/** Nombre completo del tutor (nombre + apellidos). Función pura. */
export function nombreCompletoTutor(row: TutorRow): string {
  return [row.nombre, row.apellidos].filter(Boolean).join(" ").trim();
}
