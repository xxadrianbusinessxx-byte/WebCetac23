// Diagnóstico: inspecciona el esquema real de Supabase para el Bloque 6A
// (perfiles de tutor/padre). NO modifica nada. Solo lectura.
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

const r = await fetch(`${urlBase}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const spec = await r.json();
const defs = spec.definitions ?? spec;

// 1) Tablas cuyo nombre sugiere tutor/padre/familiar/responsable/contacto.
const nombres = Object.keys(defs);
const relacionadas = nombres.filter((n) =>
  /TUTOR|PADRE|FAMIL|RESPONSABLE|CONTACTO|GUARDIA|ACUDIENTE/i.test(n),
);
console.log("TABLAS CON NOMBRE TUTOR/PADRE/FAMIL/RESPONSABLE/CONTACTO:");
console.log("  ", relacionadas.length ? relacionadas.join(", ") : "ninguna");

// 2) Columnas de ALUMNOS y ETIQUETAS PERSONALES que sugieran tutor/contacto.
for (const tabla of ["ALUMNOS", "ETIQUETAS PERSONALES", "PROFESORES"]) {
  const t = defs[tabla];
  if (!t?.properties) {
    console.log(`\n${tabla} => no está en el OpenAPI`);
    continue;
  }
  const cols = Object.keys(t.properties);
  console.log(`\n${tabla} => ${cols.join(", ")}`);
  const tutorCols = cols.filter((c) =>
    /TUTOR|PADRE|MADRE|FAMIL|RESPONSABLE|ACUDIENTE|GUARDIA|CONTACTO|TELEFONO|CELULAR|CORREO|EMAIL/i.test(c),
  );
  console.log(`  columnas tutor/contacto: ${tutorCols.length ? tutorCols.join(", ") : "ninguna"}`);
}

// 3) Lista completa de tablas (para ver el panorama).
console.log("\nTODAS LAS TABLAS EN SUPABASE:");
console.log("  ", nombres.join(", "));
