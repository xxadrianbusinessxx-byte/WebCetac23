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

const third = [
  "NOMBRE",
  "NOMBRE PROFESOR",
  "NOMBRE DEL PROFESOR",
  "PROFESOR NOMBRE",
  "AUTOR",
  "QUIEN",
  "DE",
  "PARA",
  "ALUMNO",
  "CURP PROFESOR",
  "CURP_PROFESOR",
  "PROFESOR CURP",
  "PROFESOR CURP/NOMBRE",
  "PROFESOR O CURP",
  "PROFESOR/CURP O NOMBRE",
  "PROFESOR O NOMBRE",
  "NOMBRE O CURP",
  "NOMBRE/CURP",
  "NOMBRE O CURP DEL PROFESOR",
  "CURP/NOMBRE",
  "CURP O NOMBRE",
  "CURP O NOMBRE DEL PROFESOR",
  "PROFESOR",
  "DIRECTIVO",
  "MAESTRO",
  "DOCENTE",
  "ENVIADO POR",
  "POR",
];

for (const c of third) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent("COMENTARIOS")}`, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({
      CURP: "TEST000000TEST0001",
      COMENTARIO: "x".repeat(5),
      [c]: "Prof",
    }),
  });
  const t = await r.text();
  if (r.status === 201) {
    console.log("FOUND:", c, t);
    break;
  }
  if (!t.includes("Could not find")) console.log(c, r.status, t.slice(0, 180));
}
