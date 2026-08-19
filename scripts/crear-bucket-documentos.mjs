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

const bucketName = "documentos-institucionales";

// Crear bucket privado
const r = await fetch(`${urlBase}/storage/v1/bucket`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  },
  body: JSON.stringify({
    id: bucketName,
    name: bucketName,
    public: false,
    file_size_limit: 20 * 1024 * 1024, // 20MB
    allowed_mime_types: [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
      "application/msword", // doc
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
      "application/vnd.ms-excel", // xls
      "text/csv",
      "image/png",
      "image/jpeg",
    ],
  }),
});

const text = await r.text();
console.log("Status:", r.status);
console.log("Respuesta:", text.slice(0, 1000));
