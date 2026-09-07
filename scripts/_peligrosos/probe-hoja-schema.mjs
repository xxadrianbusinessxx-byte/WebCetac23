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
const h = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

for (const tabla of [
  "1RO A CIENCIAS SOCIALES",
  "1RO A REGISTRO DE CALIFICACIONES FINALES",
]) {
  console.log("\n===", tabla, "===");
  const sel = await fetch(
    `${urlBase}/rest/v1/${encodeURIComponent(tabla)}?select=*&limit=3`,
    { headers: h },
  );
  console.log("SELECT", sel.status, await sel.text());

  const datos = JSON.stringify({
    encabezados: ["Nombre", "Cal"],
    filas: [["JUAN", "10"]],
  });
  let r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}?id=not.is.null`, {
    method: "DELETE",
    headers: { ...h, Prefer: "return=minimal" },
  });
  console.log("DELETE", r.status, await r.text());

  r = await fetch(`${urlBase}/rest/v1/${encodeURIComponent(tabla)}`, {
    method: "POST",
    headers: { ...h, Prefer: "return=representation" },
    body: JSON.stringify({
      alumno_nombre: "__HOJA__",
      datos,
    }),
  });
  console.log("INSERT datos", r.status, (await r.text()).slice(0, 400));
}
