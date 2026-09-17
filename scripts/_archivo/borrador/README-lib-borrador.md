# lib/_borrador/ — módulos de dominio sin consumidor

Módulos que compilan pero que no importa nadie en `app/` ni en `lib/`. Se conservan
aquí en vez de borrarse porque varios contienen lógica difícil de reescribir.

Sus imports relativos se reescribieron a `@/lib/<carpeta original>/…` al moverlos, así
que siguen resolviendo y siguen bajo `npx tsc --noEmit`.

| Módulo | Origen | Qué contiene |
|---|---|---|
| `migracion-catalogo.ts` (25.6 KB) | `lib/escolar/` | Siembra de catálogo e inscripciones desde etiquetas: `planSemillaCatalogo`, `aplicarSemillaCatalogo`, `previsualizarInscripcionesDesdeEtiquetas`. Su único consumidor era `scripts/_archivo/migrar-catalogo-desde-tablas.mjs`, ya archivado. **Lo más valioso de esta carpeta.** |
| `parse-hoja.ts` | `lib/escolar/` | `parseArchivoCalificaciones`, `filasAMetadataSupabase`, `metadataAVista`. |
| `materias-alumno.ts` | `lib/escolar/` | `filtrarMateriasPorGrupo`, `alumnoTieneGrupoAsignado`. |
| `capas.ts` | `lib/decoraciones/` | `separarCapasDecoracion`, `STICKER_LAYOUT`. |
| `demo-users.ts` | `lib/auth/` | `validatePortalCredentials` — login de demo, anterior al portal real. |
| `materias-demo.ts` | `lib/calificaciones/` | `MATERIAS_DEMO`, datos de ejemplo. |
| `chat/` (4 módulos) | `lib/chat/` | Dominio del chat global, **retirado el 2026-09-06**. Ver `app/_borrador/README.md`. |
| `client.ts` | `lib/supabase/` | Cliente de navegador. Sin uso porque **todo el acceso a datos pasa por el servidor**; si algún día se necesita, es este. |

Verificado el 2026-09-06 por nombre de export en todo el repo: cero referencias
externas, salvo la del script ya archivado que se indica arriba.

## Qué hacer con esto

- `demo-users.ts` y `materias-demo.ts` son restos de la etapa de demo: candidatos claros
  a borrar cuando se confirme que no se usan en ninguna presentación.
- `migracion-catalogo.ts` conviene conservarlo hasta que la siembra de catálogo esté
  cerrada del todo: rehacerlo costaría más que mantenerlo aquí.
- `client.ts` se queda como referencia de cómo se crearía el cliente de navegador.
  **Ojo:** usarlo significaría exponer consultas al navegador, y hoy las policies RLS
  son `USING (true)` — la autorización vive en TypeScript del servidor. Ver
  `ESTADO-ACTUAL.md` §4 antes de cablearlo.
