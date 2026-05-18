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
const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
const hdr = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};

const tabla = "1RO A CONCIENCIA HISTORICA";
const guesses = [
  "NO.",
  "NUM",
  "NUMERO",
  "LISTA",
  "NOMBRE COMPLETO",
  "NOMBRE DEL ALUMNO",
  "ALUMNO",
  "PATERNO",
  "MATERNO",
  "P APELLIDO",
  "S APELLIDO",
  "P_APELLIDO",
  "S_APELLIDO",
  "CALIF",
  "CALIFICACIÓN",
  "CALIFICACION",
  "P1",
  "P2",
  "P3",
  "PROM",
  "ASISTENCIA",
  "OBSERVACIONES",
  "CONTENIDO",
  "DATOS",
  "JSON",
  "RAW",
  "EXCEL",
  "FILA",
  "COLUMNA",
  "VALOR",
  "A",
  "B",
  "C",
];

for (const g of guesses) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}`, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({ [g]: "1" }),
  });
  const t = await r.text();
  if (r.status === 201) {
    console.log("FOUND", g, t);
    break;
  }
  if (!t.includes("Could not find") && !t.includes("PGRST204")) {
    console.log(g, r.status, t.slice(0, 150));
  }
}
