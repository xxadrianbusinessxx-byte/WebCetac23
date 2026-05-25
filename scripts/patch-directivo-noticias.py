from pathlib import Path

p = Path(__file__).resolve().parent.parent / "app/directivo/directivo-client.tsx"
t = p.read_text(encoding="utf-8")

old = """            <motionlessScroll className="relative z-[1] flex flex-wrap gap-2 px-1 pb-2">
              <GreyActionPill onClick={() => inputPublicacionRef.current?.click()}>
                Subir archivo
              </GreyActionPill>
              <GreyActionPill onClick={onPublicar}>Publicar</GreyActionPill>
            </motionlessScroll>"""

old = old.replace("motionlessScroll", "motionlessScroll")
old = """            <motionlessScroll className="relative z-[1] flex flex-wrap gap-2 px-1 pb-2">
              <GreyActionPill onClick={() => inputPublicacionRef.current?.click()}>
                Subir archivo
              </GreyActionPill>
              <GreyActionPill onClick={onPublicar}>Publicar</GreyActionPill>
            </motionlessScroll>""".replace("motionlessScroll", "div")

new = """            <motionlessScroll className="relative z-[1] flex flex-wrap items-center gap-2 px-1 pb-2">
              <GreyActionPill onClick={() => inputPublicacionRef.current?.click()}>
                Subir imagen
              </GreyActionPill>
              <GreyActionPill onClick={onPublicar} disabled={publicandoNoticia}>
                {publicandoNoticia ? "Publicando…" : "Publicar"}
              </GreyActionPill>
              <motionlessScroll className="flex gap-1 rounded-full border border-white/60 bg-white/50 p-1">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSlotNoticia(n)}
                    className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase ${
                      slotNoticia === n ? "bg-sky-800 text-white" : "text-sky-900"
                    }`}
                  >
                    Evento {n}
                  </button>
                ))}
              </motionlessScroll>
            </motionlessScroll>
            <p className="relative z-[1] px-2 pb-2 text-center text-[10px] font-semibold text-sky-900/90">
              Noticias en la pantalla de inicio de sesión (Cloudinary, cetac23)
            </p>""".replace("motionlessScroll", "motionlessScroll")
new = new.replace("motionlessScroll", "motionlessScroll")
for a, b in [("motionlessScroll", "motionlessScroll")]:
    pass
new = new.replace("motionlessScroll", "motionlessScroll")
# fix div tags
new = new.replace("motionlessScroll", "motionlessScroll")
import re
new = re.sub(r"</?motionlessScroll\b", lambda m: "</motionlessScroll" if m.group(0).startswith("</") else "<motionlessScroll", new)
new = new.replace("<motionlessScroll", "<motionlessScroll").replace("</motionlessScroll>", "</motionlessScroll>")
new = new.replace("motionlessScroll", "div")

old2 = """              <PreviewPanel>
                {archivoPublicacion
                  ? archivoPublicacion.name
                  : "Vista previa"}
              </PreviewPanel>"""

new2 = """              <PreviewPanel className="min-h-[160px] overflow-hidden p-2">
                {previewNoticia ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewNoticia}
                    alt="Vista previa noticia"
                    className="max-h-[200px] w-full rounded-xl object-contain"
                  />
                ) : (
                  <>Vista previa — evento {slotNoticia}</>
                )}
              </PreviewPanel>"""

if old.replace("motionlessScroll", "motionlessScroll") not in t and old not in t:
    # try without motionless
    old = old.replace("motionlessScroll", "motionlessScroll")
    
# simpler search
needle = 'Subir archivo'
if needle in t:
    t = t.replace(
        """              <GreyActionPill onClick={() => inputPublicacionRef.current?.click()}>
                Subir archivo
              </GreyActionPill>
              <GreyActionPill onClick={onPublicar}>Publicar</GreyActionPill>""",
        """              <GreyActionPill onClick={() => inputPublicacionRef.current?.click()}>
                Subir imagen
              </GreyActionPill>
              <GreyActionPill onClick={onPublicar} disabled={publicandoNoticia}>
                {publicandoNoticia ? "Publicando…" : "Publicar"}
              </GreyActionPill>
              <div className="flex gap-1 rounded-full border border-white/60 bg-white/50 p-1">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setSlotNoticia(n)}
                    className={`rounded-full px-3 py-1 text-[10px] font-extrabold uppercase ${
                      slotNoticia === n ? "bg-sky-800 text-white" : "text-sky-900"
                    }`}
                  >
                    Evento {n}
                  </button>
                ))}
              </div>""",
        1,
    )
    t = t.replace(
        """            <div className="relative z-[1] flex flex-wrap gap-2 px-1 pb-2">""",
        """            <div className="relative z-[1] flex flex-wrap items-center gap-2 px-1 pb-2">""",
        1,
    )
    t = t.replace(
        """              </GreyActionPill>
            </div>
            <motionlessScroll className="rounded-3xl border border-white/55""".replace("motionlessScroll", "motionlessScroll"),
        """              </GreyActionPill>
            </div>
            <p className="relative z-[1] px-2 pb-2 text-center text-[10px] font-semibold text-sky-900/90">
              Noticias en la pantalla de inicio de sesión (Cloudinary, cetac23)
            </p>
            <motionlessScroll className="rounded-3xl border border-white/55""".replace("motionlessScroll", "motionlessScroll"),
        1,
    )
    t = t.replace("motionlessScroll", "motionlessScroll")
    if "Noticias en la pantalla" not in t:
        t = t.replace(
            """            </div>
            <div className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
              <PreviewPanel>
                {archivoPublicacion
                  ? archivoPublicacion.name
                  : "Vista previa"}
              </PreviewPanel>""",
            """            </motionlessScroll>
            <p className="relative z-[1] px-2 pb-2 text-center text-[10px] font-semibold text-sky-900/90">
              Noticias en la pantalla de inicio de sesión (Cloudinary, cetac23)
            </p>
            <motionlessScroll className="rounded-3xl border border-white/55 bg-slate-400/25 p-4 shadow-[inset_0_2px_0_rgba(255,255,255,0.5)] backdrop-blur-md">
              <PreviewPanel className="min-h-[160px] overflow-hidden p-2">
                {previewNoticia ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewNoticia}
                    alt="Vista previa noticia"
                    className="max-h-[200px] w-full rounded-xl object-contain"
                  />
                ) : (
                  <>Vista previa — evento {slotNoticia}</>
                )}
              </PreviewPanel>""".replace("motionlessScroll", "motionlessScroll").replace("motionlessScroll", "div"),
            1,
        )
    else:
        t = t.replace(old2, new2, 1)

p.write_text(t, encoding="utf-8")
print("ok")
