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

// Traer TODAS las filas de PROFESORES con la columna Permisos y el nombre.
const rp = await fetch(
  `${urlBase}/rest/v1/PROFESORES?select=%22NOMBRE%2FPROFESOR%2FDIRECTIVO%22,Permisos&order=%22NOMBRE%2FPROFESOR%2FDIRECTIVO%22.asc`,
  { headers: { apikey: key, Authorization: `Bearer ${key}` } },
);

if (!rp.ok) {
  console.log("ERROR", rp.status, await rp.text());
  process.exit(1);
}

const rows = await rp.json();
console.log(`Total filas: ${rows.length}\n`);

for (const row of rows) {
  const nombre = row["NOMBRE/PROFESOR/DIRECTIVO"];
  const permisos = row.Permisos;
  // JSON.stringify muestra el valor literal exacto (tipo + contenido).
  console.log(
    `NOMBRE=${JSON.stringify(nombre)}  |  Permisos=${JSON.stringify(permisos)}  |  typeof=${typeof permisos}`,
  );
}

// Replicar EXACTAMENTE la lógica de rolDesdePermisos + el filtro de la app.
function rolDesdePermisos(permisos) {
  const p = String(permisos ?? "").trim().toLowerCase();
  if (p.includes("directivo")) return "directivo";
  return "maestro";
}

const asignables = rows
  .filter((row) => rolDesdePermisos(row.Permisos) !== "directivo")
  .map((row) => String(row["NOMBRE/PROFESOR/DIRECTIVO"] ?? "").trim())
  .filter(Boolean);

console.log("\n=== RESULTADO DEL FILTRO (rolDesdePermisos !== 'directivo') ===");
console.log(`Profesores asignables: ${asignables.length}`);
console.log(JSON.stringify(asignables, null, 2));


