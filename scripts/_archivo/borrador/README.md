# `scripts/_archivo/borrador/` — la cuarentena `_borrador/`, resuelta

**De dónde vino.** Estos archivos vivían en `app/_borrador/` y `lib/_borrador/`,
dos carpetas de cuarentena que existían desde la reorganización del 2026-09-06:
código que compilaba pero que **ninguna ruta montaba y ningún módulo importaba**.
El PROMPT F (2026-09-16) las resolvió **archivo por archivo**, con decisión escrita,
porque «una carpeta de borrador que nadie revisa es código muerto con otro nombre».

**Por qué están aquí y no en `app/` ni en `lib/`.** `scripts/_archivo/` es, por
ORDEN.md §4, el sitio de lo que **ya se consumió y no se re-ejecuta**: no entra en
el lint (`eslint.config.mjs` lo excluye) y nadie espera que evolucione. Sigue bajo
`npx tsc --noEmit` a través de `**/*.ts`, así que si un módulo de `lib/` cambia y
los rompe, se nota. Ante la duda se archivó en vez de borrar (R8).

| Archivo | Origen | Qué era |
|---|---|---|
| `migracion-catalogo.ts` | `lib/_borrador/` (de `lib/escolar/`) | Siembra de catálogo e inscripciones desde etiquetas. El propio README lo marcaba como **lo más valioso de la carpeta**; su único consumidor era `scripts/_archivo/migrar-catalogo-desde-tablas.mjs`, ya archivado. **No se elimina:** rehacerlo costaría más que conservarlo. |
| `parse-hoja.ts` | `lib/_borrador/` (de `lib/escolar/`) | Lectura de la hoja de calificaciones (`parseArchivoCalificaciones`, `filasAMetadataSupabase`, `metadataAVista`). |
| `capas.ts` | `lib/_borrador/` (de `lib/decoraciones/`) | `separarCapasDecoracion`, `STICKER_LAYOUT`. |
| `ciclo-evaluaciones-admin.tsx` | `app/_borrador/` | Admin de parciales del ciclo (692 líneas). |
| `reconocimiento-academico.tsx` | `app/_borrador/` | Carga académica desde CSV (682 líneas). |
| `contexto-academico-panel.tsx` | `app/_borrador/` | Panel de contexto de ciclo (196 líneas). |
| `semestres-admin.tsx` | `app/_borrador/` | Oferta de semestres por grado (147 líneas). |
| `evento-visor.tsx` | `app/_borrador/` | Visor de evento con imagen, sin dependencias de dominio (109 líneas). |
| `README-app-borrador.md` · `README-lib-borrador.md` | los README de las dos carpetas | Inventario original, con el detalle de cada módulo y qué se rescató. |

**Lo que NO está aquí, porque se eliminó** (ni valioso ni usado, y su relato queda en
`docs/historial/BITACORA-2026-09.md`):

- El **chat global** completo (`app/_borrador/chat/` y `lib/_borrador/chat/`, 7
  archivos): estaba retirado desde el 2026-09-06 por decisión de producto. Su tipo
  útil (`GeneroUsuario`) ya se había rescatado a `lib/escolar/types.ts`, y el agujero
  de autorización que tenía (`actionEnviarMensajeChat` aceptaba la identidad del
  emisor desde el cliente) está documentado en `MATRIZ-PERMISOS.md` §6.1. La tabla
  `COMENTARIOS` **no se tocó**.
- `materias-alumno.ts`: superado por la resolución del catálogo
  (`resolverMateriasAlumno`/`resolverGrupoAlumno`), que es la fuente única (R6).
- `demo-users.ts` y `materias-demo.ts`: restos de la etapa de demo; el portal real
  usa `lib/auth/portal-login.ts`.
- `client.ts`: cliente de navegador. Usarlo expondría consultas al navegador con RLS
  `USING (true)`, y la autorización de este sistema vive en TypeScript del servidor.

**Si alguna de estas features se retoma:** mover el archivo a su familia (`app/components/`
o `lib/escolar/<familia>/`), cablearlo, y borrarlo de aquí. No dejarlo en el archivo
indefinidamente.
