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

const attempts = [
  { CURP: "X", COMENTARIO: "hi", "PROFESOR/DIRECTIVO": "p" },
  { CURP: "X", COMENTARIO: "hi", "NOMBRE/ALUMNO": "a" },
  { CURP: "X", COMENTARIO: "hi", "NOMBRE/PROFESOR": "p" },
  { CURP: "X", COMENTARIO: "hi", "PROFESOR/CURP": "p" },
  { CURP: "X", COMENTARIO: "hi", MATRICULA: "p" },
  { CURP: "X", COMENTARIO: "hi", CLAVE: "p" },
];

for (const body of attempts) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent("COMENTARIOS")}`, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify(body),
  });
  console.log(Object.keys(body).join(","), r.status, (await r.text()).slice(0, 300));
}
