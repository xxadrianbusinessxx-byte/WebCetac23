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

// 1) Verificar si las tablas de asistencias existen en el OpenAPI
const r = await fetch(`${urlBase}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const spec = await r.json();
const defs = spec.definitions ?? spec;

const tablas = ["calendario_escolar", "clases_impartidas", "asistencia_alumnos"];
for (const name of tablas) {
  const t = defs[name];
  if (t?.properties) {
    console.log(`TABLA ${name} => EXISTE: ${Object.keys(t.properties).join(", ")}`);
  } else {
    console.log(`TABLA ${name} => NO existe`);
  }
}

// Verificar tablas de documentos (para confirmar el patrón de creación manual)
const tablasDoc = ["CARPETAS", "DOCUMENTOS", "PERMISOS CARPETAS"];
for (const name of tablasDoc) {
  const t = defs[name];
  if (t?.properties) {
    console.log(`TABLA ${name} => EXISTE: ${Object.keys(t.properties).join(", ")}`);
  } else {
    console.log(`TABLA ${name} => NO existe`);
  }
}


