// Verificación (solo lectura): confirma que las tablas de tutores existen
// y que las columnas coinciden exactamente con el SQL aprobado.
// Como las tablas están vacías, se verifica cada columna seleccionándola
// explícitamente (si la columna no existe, PostgREST devuelve error).
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const raw = fs.readFileSync(path.join(root, ".env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
    v = v.slice(1, -1);
  env[t.slice(0, i).trim()] = v;
}

const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

async function tableExists(table) {
  const r = await fetch(`${urlBase}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  return r.status !== 404;
}

async function columnExists(table, column) {
  const r = await fetch(`${urlBase}/rest/v1/${table}?select=${column}&limit=1`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  // 200 = columna existe (aunque la tabla esté vacía). 4xx = no existe.
  return r.status === 200;
}

const esperadoTutores = [
  "id", "clave_tutor", "nombre", "apellidos", "curp", "telefono", "correo",
  "usuario", "password_hash", "debe_cambiar_credenciales", "activo",
  "created_at", "updated_at",
];
const esperadoTutorAlumnos = [
  "id", "tutor_id", "curp_alumno", "tipo_relacion", "activo",
  "created_at", "updated_at",
];

// Nombre real (Postgres pliega identificadores sin comillas a minúsculas).
const TABLA_TUTORES = "tutores";
const TABLA_REL = "tutor_alumnos";

console.log(`=== ${TABLA_TUTORES} ===`);
if (!(await tableExists(TABLA_TUTORES))) {
  console.log("NO EXISTE");
} else {
  console.log("Existe. Verificando columnas:");
  for (const c of esperadoTutores) {
    const ok = await columnExists(TABLA_TUTORES, c);
    console.log(`  ${ok ? "OK" : "FALTA"}  ${c}`);
  }
}

console.log(`=== ${TABLA_REL} ===`);
if (!(await tableExists(TABLA_REL))) {
  console.log("NO EXISTE");
} else {
  console.log("Existe. Verificando columnas:");
  for (const c of esperadoTutorAlumnos) {
    const ok = await columnExists(TABLA_REL, c);
    console.log(`  ${ok ? "OK" : "FALTA"}  ${c}`);
  }
}
