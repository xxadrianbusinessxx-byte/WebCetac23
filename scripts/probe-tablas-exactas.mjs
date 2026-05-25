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

const tablas = [
  "ALUMNOS",
  "PROFESORES",
  "COMENTARIOS PROFESORES",
  "ETIQUETAS (STATUS)",
  "ETIQUETAS PERSONALES",
  "BOLETA",
  "COMENTARIOS",
];

for (const nombre of tablas) {
  const u = `${urlBase}/rest/v1/${encodeURIComponent(nombre)}?select=*&limit=2`;
  const r = await fetch(u, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  const txt = await r.text();
  let body;
  try {
    body = JSON.parse(txt);
  } catch {
    body = txt.slice(0, 120);
  }
  if (r.ok && Array.isArray(body)) {
    console.log(`OK  ${nombre}`);
    if (body[0]) console.log(`    columnas: ${Object.keys(body[0]).join(", ")}`);
    else console.log("    (vacía)");
  } else {
    const msg =
      typeof body === "object" && body?.message ? body.message : String(body);
    console.log(`ERR ${r.status} ${nombre} — ${msg}`);
  }
}
