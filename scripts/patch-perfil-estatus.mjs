import fs from "node:fs";

const p = "app/perfil/perfil-client.tsx";
let t = fs.readFileSync(p, "utf8");
const start = t.indexOf('                <motionlessScroll className="-mx-1 overflow-x-auto');
const altStart = t.indexOf('                <div className="-mx-1 overflow-x-auto');
const s = start >= 0 ? start : altStart;
const end = t.indexOf('            {tab === "comentarios"', s);
if (s < 0 || end < 0) {
  console.error("markers not found", s, end);
  process.exit(1);
}
const replacement = `                {(registro.grado || registro.grupo || registro.carrera) && (
                  <p className="text-center text-[11px] font-bold uppercase tracking-wide text-sky-900">
                    {registro.grado} · Grupo {registro.grupo}
                    {registro.carrera ? \` · \${registro.carrera}\` : ""}
                  </p>
                )}
                {registro.mensaje && (
                  <p className="text-center text-xs font-semibold text-amber-900">
                    {registro.mensaje}
                  </p>
                )}
                <MateriaTablaVistaPanel
                  vista={
                    registro.filas.length
                      ? {
                          encabezados: registro.encabezados,
                          filas: registro.filas,
                        }
                      : null
                  }
                  materiaNombre={
                    registro.nombreTabla ?? "Registro de calificaciones"
                  }
                />
`;
t = t.slice(0, s) + replacement + t.slice(end);
fs.writeFileSync(p, t);
console.log("patched perfil estatus");
