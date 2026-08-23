// Diagnóstico: verifica que CURP en ALUMNOS no tenga valores duplicados.
// Solo lectura. NO modifica nada.
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

// 1) Total de filas en ALUMNOS.
const head = await fetch(`${urlBase}/rest/v1/ALUMNOS?select=CURP`, {
  headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: "count=exact" },
});
const total = Number(head.headers.get("content-range")?.split("/")[1] ?? "0");

// 2) Traer todos los CURP paginando (1000 por página).
const curps = [];
let desde = 0;
const PAGE = 1000;
// eslint-disable-next-line no-constant-condition
while (true) {
  const r = await fetch(
    `${urlBase}/rest/v1/ALUMNOS?select=CURP&order=CURP&offset=${desde}&limit=${PAGE}`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  const data = await r.json();
  if (!Array.isArray(data) || data.length === 0) break;
  for (const row of data) {
    const c = String(row?.CURP ?? "").trim().toUpperCase();
    if (c) curps.push(c);
  }
  if (data.length < PAGE) break;
  desde += PAGE;
}

// 3) Detectar duplicados.
const vistos = new Map();
const duplicados = [];
for (const c of curps) {
  if (vistos.has(c)) duplicados.push(c);
  else vistos.set(c, true);
}

console.log("Total filas ALUMNOS (content-range):", total);
console.log("CURP no vacíos leídos:", curps.length);
console.log("CURP únicos:", vistos.size);
console.log("CURP duplicados:", duplicados.length);
if (duplicados.length > 0) {
  console.log("Valores duplicados:", [...new Set(duplicados)].join(", "));
} else {
  console.log("OK: no hay CURP duplicados en ALUMNOS.");
}
