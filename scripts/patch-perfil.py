from pathlib import Path

p = Path("app/perfil/perfil-client.tsx")
t = p.read_text(encoding="utf-8")

# fix state for etiquetas
t = t.replace(
    "  const [e1, e2, e3] = etiquetasEstatusDesdeFila(etiquetas);\n  const [p1, p2, p3] = etiquetasPersonalesDesdeFila(etiquetas);",
    "  const [e1, setE1] = useState(etiquetasEstatusDesdeFila(etiquetas)[0]);\n  const [e2, setE2] = useState(etiquetasEstatusDesdeFila(etiquetas)[1]);\n  const [e3, setE3] = useState(etiquetasEstatusDesdeFila(etiquetas)[2]);\n  const [p1, setP1] = useState(etiquetasPersonalesDesdeFila(etiquetas)[0]);\n  const [p2, setP2] = useState(etiquetasPersonalesDesdeFila(etiquetas)[1]);\n  const [p3, setP3] = useState(etiquetasPersonalesDesdeFila(etiquetas)[2]);",
)

old_materia = """                {materiaSub === "asignaturas" ? (
                  <motionlessScroll className="flex min-h-[220px] flex-1 items-center justify-center rounded-[1.5rem] border border-white/45 bg-slate-500/20 px-6 py-16 text-center text-sm font-semibold text-slate-700 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm sm:min-h-[280px]">
                    Contenido de{" "}
                    <span className="font-extrabold text-sky-900">
                      Materia {materiaFiltro + 1}
                    </span>
                    <br />
                    <span className="mt-2 block text-xs font-medium opacity-80">
                      Aquí irá el detalle de la asignatura seleccionada.
                    </span>
                  </motionlessScroll>"""

old_materia = old_materia.replace("</motionlessScroll>", "</div>")

new_materia = """                {materiaSub === "asignaturas" ? (
                  <div className="flex min-h-[220px] flex-1 flex-col rounded-[1.5rem] border border-white/45 bg-slate-500/20 px-4 py-6 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] backdrop-blur-sm sm:min-h-[280px]">
                    <MateriaTablaVistaPanel vista={vistaMateria} materiaNombre={materiaSeleccionada} />
                  </motionlessScroll>""".replace("</motionlessScroll>", "</motionlessScroll>")

if "materiaFiltro" in t:
    t = t.replace(old_materia, new_materia.replace("</motionlessScroll>", "</div>"))

# personalLabels block
old_personal = """                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                      {personalLabels.flatMap((row, ri) =>
                        row.map((cell, ci) => (
                          <BubblePill
                            key={`${ri}-${ci}`}
                            className="min-h-[2.75rem]"
                          >
                            {cell}
                          </BubblePill>
                        )),
                      )}
                    </motionlessScroll>""".replace("</motionlessScroll>", "</motionlessScroll>")

new_personal = """                    <motionlessScroll className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                      {[
                        ["CURP", alumno?.CURP],
                        ["Nombre", alumno?.NOMBRE],
                        ["Apellido P", alumno?.P_APELLIDO],
                        ["Apellido M", alumno?.S_APELLIDO],
                        ["Clave", alumno?.CLAVE],
                        ["Género", etiquetas?.GENERO],
                        ["Grado", etiquetas?.GRADO],
                        ["Grupo", etiquetas?.GRUPO],
                      ].map(([l, v]) => (
                        <BubblePill key={l} className="min-h-[2.75rem]">{l}: {v ?? "—"}</BubblePill>
                      ))}
                    </motionlessScroll>"""

if "personalLabels" in t:
    t = t.replace(
        """                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
                      {personalLabels.flatMap((row, ri) =>
                        row.map((cell, ci) => (
                          <BubblePill
                            key={`${ri}-${ci}`}
                            className="min-h-[2.75rem]"
                          >
                            {cell}
                          </BubblePill>
                        )),
                      )}
                    </motionlessScroll>""".replace("motionlessScroll", "div"),
        new_personal.replace("motionlessScroll", "motionlessScroll").replace("motionlessScroll", "div"),
    )

# comentarios
old_com = """            {tab === "comentarios" && (
              <ul className="flex flex-col gap-4">
                {[1, 2, 3].map((n) => (
                  <li
                    key={n}
                    className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4"
                  >
                    <span className="shrink-0 rounded-full border border-white/80 bg-white/95 px-4 py-2 text-center text-[11px] font-extrabold uppercase tracking-wide text-sky-800 shadow-[inset_0_2px_0_rgba(255,255,255,1)] sm:min-w-[8.5rem]">
                      Profesor &apos;{n}&apos;
                    </span>
                    <div className="relative min-h-[3rem] flex-1 overflow-hidden rounded-full border border-white/60 bg-slate-400/35 px-4 py-3 text-center text-sm font-bold text-sky-900 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-sm">
                      Comentarios
                      <motionlessScroll
                        className="pointer-events-none absolute inset-x-8 top-1 h-[35%] rounded-b-[100%] bg-linear-to-b from-white/40 to-transparent"
                        aria-hidden
                      />
                    </motionlessScroll>
                  </li>
                ))}
              </ul>
            )}"""

new_com = """            {tab === "comentarios" && (
              <ul className="flex flex-col gap-4">
                {comentarios.length === 0 && (
                  <li className="text-center text-sm font-semibold text-slate-600">
                    Sin comentarios en COMENTARIOS.
                  </li>
                )}
                {comentarios.map((c, i) => (
                  <li key={`${c.CURP}-${i}`} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
                    <span className="shrink-0 rounded-full border border-white/80 bg-white/95 px-4 py-2 text-center text-[11px] font-extrabold uppercase tracking-wide text-sky-800 sm:min-w-[8.5rem]">
                      Comentario
                    </span>
                    <div className="relative min-h-[3rem] flex-1 rounded-full border border-white/60 bg-slate-400/35 px-4 py-3 text-sm font-bold text-sky-900">
                      {c.COMENTARIO}
                    </motionlessScroll>
                  </li>
                ))}
              </ul>
            )}"""

for a, b in [(old_com, new_com)]:
    a = a.replace("motionlessScroll", "div")
    b = b.replace("motionlessScroll", "motionlessScroll").replace("motionlessScroll", "div")
    if a.split("Profesor")[0] in t:
        t = t.replace(a, b, 1)

# estatus etiquetas row
t = t.replace(
    """                      <BubblePill>Etiqueta</BubblePill>
                      <BubblePill>Etiqueta</BubblePill>""",
    """                      <BubblePill>{i === 0 ? e1 : i === 1 ? e2 : "—"}</BubblePill>
                      <BubblePill>{i === 0 ? p1 : i === 1 ? p2 : p3}</BubblePill>""",
    1,
)

p.write_text(t, encoding="utf-8")
print("done", "materiaFiltro" in t, "personalLabels" in t)
