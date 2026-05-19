from pathlib import Path

p = Path(__file__).resolve().parent.parent / "app/perfil/perfil-client.tsx"
t = p.read_text(encoding="utf-8")

old_personal = """                    <div className="rounded-full border border-white/75 bg-white/90 px-5 py-4 text-center text-sm font-bold text-sky-900 shadow-[inset_0_2px_0_rgba(255,255,255,1)]">
                      Comentarios del alumno acerca de él
                    </div>"""

new_personal = """                    <div className="flex flex-col gap-3">
                      <p className="text-center text-xs font-extrabold uppercase tracking-wide text-sky-900">
                        Etiquetas personales (ETIQUETAS PERSONALES)
                      </p>
                      {[0, 1, 2].map((i) => (
                        <motionlessScroll key={`etiq-${i}`} className="grid gap-2 sm:grid-cols-2">
                          <input
                            type="text"
                            value={titulos[i]}
                            disabled={!puedeEditarEtiquetas}
                            onChange={(e) => {
                              const next = [...titulos] as [string, string, string];
                              next[i] = e.target.value;
                              setTitulos(next);
                            }}
                            className="rounded-full border border-white/70 bg-white/95 px-4 py-2 text-center text-xs font-bold text-sky-900 disabled:opacity-70"
                            placeholder={`Etiqueta ${i + 1}`}
                          />
                          <input
                            type="text"
                            value={valores[i]}
                            disabled={!puedeEditarEtiquetas}
                            onChange={(e) => {
                              const next = [...valores] as [string, string, string];
                              next[i] = e.target.value;
                              setValores(next);
                            }}
                            className="rounded-full border border-white/60 bg-slate-400/35 px-4 py-2 text-center text-xs font-bold text-sky-900 disabled:opacity-70"
                            placeholder="Valor"
                          />
                        </motionlessScroll>
                      ))}
                      {puedeEditarEtiquetas && (
                        <button
                          type="button"
                          disabled={guardando}
                          onClick={() => void guardarEtiquetas()}
                          className="mx-auto rounded-full border border-sky-800/40 bg-white/95 px-6 py-2 text-[11px] font-extrabold uppercase tracking-wide text-sky-900 shadow-sm disabled:opacity-60"
                        >
                          Guardar etiquetas
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <p className="text-center text-xs font-extrabold uppercase tracking-wide text-sky-900">
                        Comentario personal
                      </p>
                      <textarea
                        value={comentarioPersonal}
                        disabled={!puedeEditarEtiquetas}
                        maxLength={COMENTARIO_MAX_LENGTH}
                        onChange={(e) =>
                          setComentarioPersonal(
                            e.target.value.slice(0, COMENTARIO_MAX_LENGTH),
                          )
                        }
                        rows={3}
                        className="w-full resize-none rounded-2xl border border-white/70 bg-white/95 px-4 py-3 text-sm font-semibold text-sky-900 disabled:opacity-70"
                        placeholder="Escribe algo sobre ti…"
                      />
                      <p className="text-right text-[10px] font-semibold text-slate-600">
                        {comentarioPersonal.length}/{COMENTARIO_MAX_LENGTH}
                      </p>
                      {puedeEditarEtiquetas && (
                        <button
                          type="button"
                          disabled={guardando}
                          onClick={() => void guardarComentario()}
                          className="mx-auto rounded-full border border-sky-800/40 bg-white/95 px-6 py-2 text-[11px] font-extrabold uppercase tracking-wide text-sky-900 shadow-sm disabled:opacity-60"
                        >
                          Guardar comentario
                        </button>
                      )}
                    </div>"""

new_personal = new_personal.replace("motionlessScroll", "div")

old_estatus = """            {tab === "estatus" && (
              <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0">
                <div className="grid min-w-[36rem] grid-cols-4 gap-2 sm:min-w-0 sm:gap-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={`estatus-row-${i}`} className="contents">
                      <BubblePill>{estatusCol1[i]}</BubblePill>
                      <BubblePill>{estatusCol2[i]}</BubblePill>
                      <BubblePill>{i === 0 ? e1 : i === 1 ? e2 : "—"}</BubblePill>
                      <BubblePill>{i === 0 ? p1 : i === 1 ? p2 : p3}</BubblePill>
                    </div>
                  ))}
                </div>
              </div>
            )}"""

new_estatus = """            {tab === "estatus" && (
              <div className="flex flex-col gap-4">
                <p className="text-center text-xs font-semibold text-slate-700">
                  ETIQUETAS (STATUS) — promedios y materias por ciclo
                </p>
                <div className="-mx-1 overflow-x-auto pb-1 sm:mx-0">
                  <div className="grid min-w-[36rem] grid-cols-4 gap-2 sm:min-w-0 sm:gap-3">
                    {STATUS_FILAS_PROMEDIO.map((fila, i) => (
                      <div key={`prom-${fila}`} className="contents">
                        <BubblePill>{fila}</BubblePill>
                        <BubblePill>{estatus.promedios[fila]}</BubblePill>
                        <BubblePill>{STATUS_FILAS_MATERIAS[i]}</BubblePill>
                        <BubblePill>
                          {estatus.materias[STATUS_FILAS_MATERIAS[i]]}
                        </BubblePill>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-t border-white/50 pt-4">
                  <p className="mb-3 text-center text-xs font-extrabold uppercase tracking-wide text-sky-900">
                    Etiquetas personales vinculadas
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {titulos.map((t, i) => (
                      <BubblePill key={`est-p-${i}`} className="min-h-[2.5rem]">
                        {t}: {valores[i] || "—"}
                      </BubblePill>
                    ))}
                  </div>
                </div>
              </div>
            )}"""

if old_personal not in t:
    raise SystemExit("old_personal not found")
if old_estatus not in t:
    raise SystemExit("old_estatus not found")

t = t.replace(old_personal, new_personal).replace(old_estatus, new_estatus)

mensaje_block = """          {mensaje && (
            <p className="mb-4 rounded-xl border border-sky-300/60 bg-white/90 px-4 py-2 text-center text-xs font-bold text-sky-900">
              {mensaje}
            </p>
          )}
"""
marker = "        {/* Contenedor principal con pestañas */}"
if mensaje_block.strip() not in t and marker in t:
    t = t.replace(marker, mensaje_block + marker)

p.write_text(t, encoding="utf-8")
print("patched ok")
