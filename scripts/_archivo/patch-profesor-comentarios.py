from pathlib import Path

p = Path("app/profesor/profesor-client.tsx")
t = p.read_text(encoding="utf-8")
needle = """              className="min-h-[140px] w-full resize-y rounded-[1.5rem] border border-white/45 bg-slate-500/20 px-5 py-4 text-sm font-semibold text-slate-700 placeholder:text-slate-600/80 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] outline-none backdrop-blur-sm focus:ring-2 focus:ring-sky-400/50"
            />
          </div>
        </section>"""
repl = """              className="min-h-[140px] w-full resize-y rounded-[1.5rem] border border-white/45 bg-slate-500/20 px-5 py-4 text-sm font-semibold text-slate-700 placeholder:text-slate-600/80 shadow-[inset_0_3px_12px_rgba(0,0,0,0.06)] outline-none backdrop-blur-sm focus:ring-2 focus:ring-sky-400/50"
            />
            <p className="mt-1 text-right text-[10px] font-semibold text-slate-600">
              {comentario.length}/{COMENTARIO_MAX_LENGTH}
            </p>
            {mensajeComentario && (
              <p className="mt-2 text-center text-xs font-semibold text-sky-900">
                {mensajeComentario}
              </p>
            )}
          </motionlessScroll>
        </section>"""
if needle not in t:
    raise SystemExit("needle not found")
t = t.replace(needle, repl.replace("</motionlessScroll>", "</div>"), 1)
p.write_text(t, encoding="utf-8")
print("patched")
