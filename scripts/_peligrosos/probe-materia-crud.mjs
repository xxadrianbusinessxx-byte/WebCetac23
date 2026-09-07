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
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const service = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

const tabla = "6TO B MECATRONICA CIENCIAS NATURALES";

async function probe(key, label) {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const sel = await fetch(
    `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=id,columna1,columna2&limit=3`,
    { headers },
  );
  console.log(`\n[${label}] SELECT`, sel.status, (await sel.text()).slice(0, 300));

  const del = await fetch(
    `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?id=not.is.null`,
    { method: "DELETE", headers: { ...headers, Prefer: "return=minimal" } },
  );
  console.log(`[${label}] DELETE id=not.is.null`, del.status, await del.text());

  const ins = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify([
      { columna1: "__HEADERS__", columna2: '["Nombre","Cal"]' },
      { columna1: "TEST", columna2: '["Alumno","10"]' },
    ]),
  });
  console.log(`[${label}] INSERT`, ins.status, (await ins.text()).slice(0, 400));
}

await probe(anon, "anon");
if (service) await probe(service, "service");
