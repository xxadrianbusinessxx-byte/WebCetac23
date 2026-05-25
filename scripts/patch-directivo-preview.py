from pathlib import Path

p = Path("app/directivo/directivo-client.tsx")
t = p.read_text(encoding="utf-8")
old = """              <PreviewPanel className="min-h-[200px] sm:min-h-[240px]">
                <div>
                  <p>Vista previa de su excel</p>
                  <p className="mt-2 text-xs font-medium text-slate-600/90">
                    {materiaSeleccionada}
                  </p>
                </div>
              </PreviewPanel>"""
new = """              <PreviewPanel className="min-h-[200px] sm:min-h-[240px]">
                {cargandoVista ? (
                  <p>Cargando…</p>
                ) : (
                  <MateriaTablaVistaPanel
                    vista={vistaMateria}
                    materiaNombre={materiaSeleccionada}
                  />
                )}
              </PreviewPanel>"""
if old not in t:
    raise SystemExit("not found")
p.write_text(t.replace(old, new), encoding="utf-8")
print("ok")
