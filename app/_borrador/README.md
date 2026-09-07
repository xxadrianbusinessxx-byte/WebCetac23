# app/_borrador/ — UI sin consumidor

Componentes React **completos y que compilan**, pero que **ninguna ruta monta**.
No son residuo: parecen trabajo empezado y no cableado. Por eso se mueven aquí en vez
de borrarse.

El prefijo `_` hace que Next.js excluya la carpeta del enrutado. Siguen bajo
`npx tsc --noEmit`, así que si algo de `lib/` cambia y los rompe, te enteras.

| Componente | Export | Qué parece hacer |
|---|---|---|
| `ciclo-evaluaciones-admin.tsx` | `CicloEvaluacionesAdmin` | Admin de parciales del ciclo. Usa `actions/evaluaciones` e `inscripciones-admin`. |
| `reconocimiento-academico.tsx` | `ReconocimientoAcademico` | Carga académica desde CSV. Usa `actions/carga-academica`. |
| `contexto-academico-panel.tsx` | `ContextoAcademicoPanel` | Panel de contexto de ciclo. Usa `actions/contexto-ciclo`. |
| `semestres-admin.tsx` | `SemestresOfertaAdmin` | Oferta de semestres por grado. Usa `actions/semestres`. |
| `evento-visor.tsx` | `EventoConVisor` | Visor de evento con imagen. Sin dependencias de dominio. |

## Chat global / mural — RETIRADO el 2026-09-06

Decisión de producto: el chat global se retira del sistema; hay un reemplazo previsto,
sin fecha. El código se conserva entero por si el reemplazo reutiliza partes.

| Archivo | Qué era |
|---|---|
| `chat/page.tsx` · `chat/chat-client.tsx` | La ruta `/chat` y su UI. Al estar bajo `_borrador/` (carpeta privada de Next) **ya no genera ruta**: el build pasó de 10 a 9. |
| `chat/chat-actions.ts` | Las 3 Server Actions (`actionListarMensajesChat`, `actionEnviarMensajeChat`, `actionSubirImagenChat`). |
| `lib/_borrador/chat/` | Dominio: `storage`, `constants`, `comentario-codigo`, `types`. |

Se retiró además la entrada «Chat» de `app/components/ui/barra-navegacion.tsx` y su
helper `origenChatPara`, que quedaba muerto.

**Lo rescatado:** el tipo `GeneroUsuario` vivía en `lib/chat/types.ts` pero lo usan el
icono de persona y los perfiles demo, así que se movió a `lib/escolar/types.ts`. No
depende del chat.

**Los datos no se tocaron.** El chat escribía en la tabla `COMENTARIOS`, que sigue
intacta y en uso por los comentarios de perfil. Retirar la UI no borró nada.

> Al retirarlo, `actionEnviarMensajeChat` era además uno de los dos agujeros de
> autorización del sistema: no leía la sesión y aceptaba la identidad del emisor
> desde el cliente. Si el reemplazo reutiliza este código, **eso es lo primero que
> hay que corregir**. Ver `docs/sistema/MATRIZ-PERMISOS.md` §6.1.

---

Verificado el 2026-09-06: los cinco nombres de export no aparecen en ningún otro
archivo de `app/`, `lib/`, `scripts/`, `supabase/`, `proxy.ts` ni `next.config.ts`,
y no hay imports dinámicos que los alcancen.

## Qué hacer con esto

- **Si la feature se retoma:** mover el componente de vuelta a `app/components/` y
  montarlo desde su `page.tsx` o `*-client.tsx`.
- **Si se descarta:** borrar el archivo y, si sus `action*` tampoco tienen otro
  consumidor, borrarlas también (hay 21 `action*` sin consumidor, ver el análisis).

No dejar nada aquí indefinidamente: una carpeta de borrador que nadie revisa es
código muerto con otro nombre.
