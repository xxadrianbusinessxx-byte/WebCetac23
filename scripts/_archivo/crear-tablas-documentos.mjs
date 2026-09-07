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
const ref = urlBase.split("//")[1].split(".")[0];
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const SQL = `
CREATE TABLE IF NOT EXISTS "CARPETAS" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  parent_id uuid REFERENCES "CARPETAS"(id) ON DELETE CASCADE,
  creado_por text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "DOCUMENTOS" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carpeta_id uuid NOT NULL REFERENCES "CARPETAS"(id) ON DELETE CASCADE,
  nombre_original text NOT NULL,
  ruta_storage text NOT NULL,
  tipo text,
  tamano_bytes bigint,
  curp_vinculado text,
  subido_por text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "PERMISOS CARPETAS" (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profesor text NOT NULL,
  carpeta_id uuid NOT NULL REFERENCES "CARPETAS"(id) ON DELETE CASCADE,
  nivel text NOT NULL CHECK (nivel IN ('ver','subir','eliminar')),
  autorizado_por text,
  created_at timestamptz DEFAULT now()
);
`;

// Intentar ejecutar vía Management API con la service role key
const mgmtUrl = `https://api.supabase.com/v1/projects/${ref}/database/query`;
const r = await fetch(mgmtUrl, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${serviceKey}`,
  },
  body: JSON.stringify({ query: SQL }),
});

const text = await r.text();
console.log("Status:", r.status);
console.log("Respuesta:", text.slice(0, 2000));
