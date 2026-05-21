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
const key =
  env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

const r = await fetch(`${urlBase}/rest/v1/`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
const spec = await r.json();
const defs = spec.definitions ?? spec;
const sistema = new Set([
  "ALUMNOS",
  "PROFESORES",
  "COMENTARIOS",
  "COMENTARIOS PROFESORES",
  "ETIQUETAS (STATUS)",
  "ETIQUETAS PERSONALES",
  "BOLETA",
  "mensajes_chat",
]);

const todas = Object.keys(defs).filter((k) => !k.startsWith("rpc_")).sort();
const materias = todas.filter(
  (t) => !sistema.has(t) && !/REGISTRO DE CALIFICACIONES FINALES/i.test(t),
);
const registros = todas.filter((t) =>
  /REGISTRO DE CALIFICACIONES FINALES/i.test(t),
);

const writeList = (file, constName, arr) => {
  const out = `/** Generado desde Supabase OpenAPI — node scripts/gen-tablas-desde-supabase.mjs */
export const ${constName}: readonly string[] = ${JSON.stringify(arr, null, 2)} as const;
`;
  fs.writeFileSync(path.join(root, "lib", "escolar", file), out);
};

writeList("materias-list.ts", "MATERIAS_ESCOLAR", materias);
writeList("registros-list.ts", "REGISTROS_ESCOLAR", registros);
console.log("materias:", materias.length, "registros:", registros.length);
