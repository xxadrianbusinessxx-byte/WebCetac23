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

const cols = [
  "PROFESOR/DIRECTIVO",
  "NOMBRE/ALUMNO",
  "NOMBRE PROFESOR",
  "NOMBRE",
  "AUTOR",
  "CLAVE",
  "CURP PROFESOR",
];
for (const c of cols) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent("COMENTARIOS")}`, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({
      CURP: "TEST000000TEST0000",
      COMENTARIO: "ok",
      [c]: "Prof Test",
    }),
  });
  const t = await r.text();
  if (r.status === 201) {
    console.log("OK col tercera:", c, t);
    break;
  }
  if (!t.includes("Could not find")) console.log(c, r.status, t.slice(0, 200));
}

// materia columns - try common spreadsheet headers
const mg = [
  "NOMBRE",
  "P_APELLIDO",
  "S_APELLIDO",
  "CURP",
  "CLAVE",
  "CALIFICACION",
  "PROMEDIO",
  "PARCIAL 1",
  "PARCIAL1",
  "ETIQUETA 1",
  "ETIQUETA1",
];
for (const g of mg) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent("1RO A CONCIENCIA HISTORICA")}`, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({ [g]: "1" }),
  });
  const t = await r.text();
  if (r.status === 201) console.log("materia OK", g, t);
  else if (!t.includes("Could not find")) console.log("materia", g, r.status, t.slice(0, 150));
}
