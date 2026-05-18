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

async function post(tabla, body) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}`, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify(body),
  });
  console.log(JSON.stringify(body), "=>", r.status, (await r.text()).slice(0, 500));
}

await post("COMENTARIOS", {
  CURP: "TEST000000TEST0000",
  COMENTARIO: "prueba",
  PROFESOR: "x",
});
await post("COMENTARIOS", {
  CURP: "TEST000000TEST0000",
  COMENTARIO: "prueba",
  "NOMBRE PROFESOR": "x",
});
await post("COMENTARIOS PROFESORES", { COMENTARIO: "x" });
await post("COMENTARIOS PROFESORES", { PROFESOR: "x", COMENTARIO: "y" });

const guesses = ["NOMBRE", "APELLIDO", "CALIFICACION", "PROMEDIO", "MATRICULA", "CLAVE"];
for (const g of guesses) {
  const r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent("1RO A CONCIENCIA HISTORICA")}`, {
    method: "POST",
    headers: hdr,
    body: JSON.stringify({ [g]: "1" }),
  });
  const t = await r.text();
  if (!t.includes("Could not find")) console.log("materia col", g, r.status, t.slice(0, 200));
}
