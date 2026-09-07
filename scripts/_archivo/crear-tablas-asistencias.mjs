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
const ref = urlBase.split("//")[1].split(".")[0];
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!ref || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

// Leer el SQL aprobado desde el archivo
const sqlPath = path.join(root, "supabase", "crear-tablas-asistencias.sql");
const SQL = fs.readFileSync(sqlPath, "utf8");

console.log("Ejecutando SQL en Supabase (Management API)...");
console.log("Ref:", ref);
console.log("Longitud SQL:", SQL.length, "caracteres\n");

const mgmtUrl = `https://api.supabase.com/v1/projects/${ref}/database/query`;
const r = await fetch(mgmtUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceKey}`,
  },
  body: JSON.stringify({ query: SQL }),
});

const text = await r.text();
console.log("Status:", r.status);
console.log("Respuesta:", text.slice(0, 3000));
