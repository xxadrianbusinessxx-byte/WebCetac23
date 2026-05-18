/**
 * Solo lectura: confirma conexión al proyecto Supabase vía REST y lista
 * tablas/vistas expuestas por PostgREST (procedente del esquema public).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.join(import.meta.dirname, "..");
const envPath = path.join(root, ".env.local");
let raw;
try {
  raw = fs.readFileSync(envPath, "utf8");
} catch (e) {
  console.error("No se puede leer .env.local:", e.message);
  process.exit(1);
}

const env = {};
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  if (i < 1) continue;
  const k = t.slice(0, i).trim();
  let v = t.slice(i + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  env[k] = v;
}

const urlBase = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const key =
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

console.log("[check] NEXT_PUBLIC_SUPABASE_URL:", urlBase ? "sí (definida)" : "NO");
console.log("[check] Clave pública anon/publishable:", key ? "sí (definida)" : "NO");
if (!urlBase || !key) {
  process.exit(1);
}

const openapiUrl = `${urlBase}/rest/v1/`;
console.log("[REST] GET openapi (solo metadatos, sin exponer datos)…");

const res = await fetch(openapiUrl, {
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/openapi+json",
  },
});

console.log("[REST] HTTP status:", res.status, res.statusText);
let tables = [];
if (!res.ok) {
  const body = await res.text();
  console.warn(
    "[REST] OpenAPI no disponible con clave anon (común en Supabase):",
    body.slice(0, 200),
  );
} else {
  const schema = await res.json();
  const pathsObj = schema.paths ?? {};
  tables = [...new Set(
    Object.keys(pathsObj)
      .filter((p) => /^\/[^/?]+$/.test(p))
      .map((p) => p.replace(/^\//, "")),
  )].sort();
}

console.log("");
console.log("Recursos REST (tablas/vistas en public expuestos a anon):");
if (tables.length === 0) {
  console.log(
    " (no listado vía OpenAPI — se usa el sondeo por nombre más abajo)",
  );
} else {
  for (const t of tables) {
    console.log(" -", t);
  }
}
console.log("");
console.log("Total listado OpenAPI:", tables.length);

/** Probar tablas habituales y mostrar solo conteo / error (sin exponer filas). */
const candidatos = [
  "alumnos",
  "alumno",
  "estudiantes",
  "materias",
  "materia",
  "archivos_calificaciones",
  "calificaciones",
  "mensajes_chat",
  "usuarios",
  "profesores",
  "excel_materias",
  "excels_materias",
  "archivos_materia",
  "materias_excel",
  "hoja_calculo",
  "boletas",
  "cursos",
  "curso",
  "grupos",
];

console.log("");
console.log("Sondeo SELECT limit=1 (solo anon, según RLS):");
for (const n of candidatos) {
  const u = `${urlBase}/rest/v1/${encodeURIComponent(n)}?select=*&limit=1`;
  try {
    const r = await fetch(u, {
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
      },
    });
    const txt = await r.text();
    let parsed;
    try {
      parsed = JSON.parse(txt);
    } catch {
      parsed = txt.slice(0, 200);
    }
    if (r.ok && Array.isArray(parsed)) {
      console.log(` - ${n}: HTTP ${r.status} filas en muestra=${parsed.length}`);
      if (parsed.length > 0 && typeof parsed[0] === "object") {
        console.log(`   columnas:${Object.keys(parsed[0]).join(", ")}`);
      }
    } else {
      const msg =
        typeof parsed === "object" && parsed && "message" in parsed
          ? parsed.message
          : String(parsed);
      console.log(` - ${n}: HTTP ${r.status} — ${msg}`);
    }
  } catch (e) {
    console.log(` - ${n}: error red — ${e.message}`);
  }
}

console.log("");
console.log("OPTIONS /rest/v1/alumnos (cabeceras útiles si existen):");
try {
  const rOpt = await fetch(`${urlBase}/rest/v1/alumnos`, {
    method: "OPTIONS",
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  console.log(" HTTP:", rOpt.status);
  const names = [...rOpt.headers.keys()].filter(
    (h) =>
      h.toLowerCase().includes("postgrest") ||
      h.toLowerCase().includes("allow") ||
      h.toLowerCase().includes("content-type"),
  );
  for (const n of names) {
    console.log(`  ${n}: ${rOpt.headers.get(n)}`);
  }
  const ua = rOpt.headers.get("Access-Control-Allow-Methods");
  if (ua) console.log(" Allow-Methods-ish:", ua);
} catch (e) {
  console.log(" error:", e.message);
}
