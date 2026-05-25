/**
 * Solo lectura: prueba GET a tablas tras desactivar RLS.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const envPath = path.join(root, ".env.local");
const raw = fs.readFileSync(envPath, "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[t.slice(0, i).trim()] = v;
}

const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key =
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

if (!urlBase || !key) {
  console.error("Falta URL o clave en .env.local");
  process.exit(1);
}

const candidatos = [
  "alumnos",
  "6TO SOCIOEMOCIONALES",
  "6TO_SOCIOEMOCIONALES",
  "6to_socioemocionales",
];

async function probe(displayName, pathSegment) {
  const u = `${urlBase}/rest/v1/${pathSegment}?select=*&limit=3`;
  const r = await fetch(u, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const txt = await r.text();
  let body;
  try {
    body = JSON.parse(txt);
  } catch {
    body = txt.slice(0, 300);
  }
  return { status: r.status, body };
}

console.log("Consultas select=* limit=3 (solo lectura)\n");

for (const name of candidatos) {
  const pathSeg = encodeURIComponent(name);

  const { status, body } = await probe(name, pathSeg);

  if (status === 200 && Array.isArray(body)) {
    console.log(`✓ ${name}`);
    console.log(`  HTTP ${status} | filas devueltas: ${body.length}`);
    if (body.length > 0 && typeof body[0] === "object") {
      console.log(`  columnas (muestra): ${Object.keys(body[0]).join(", ")}`);
    } else {
      console.log("  (sin filas en las primeras 3 — tabla vacía o sin coincidencias)");
    }
  } else {
    const msg =
      typeof body === "object" && body?.message ? body.message : String(body);
    console.log(`✗ ${name}`);
    console.log(`  HTTP ${status} — ${msg}`);
  }
  console.log("");
}
