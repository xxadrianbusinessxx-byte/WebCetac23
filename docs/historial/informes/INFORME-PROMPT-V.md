# INFORME — PROMPT V (documentación para agentes)

Fecha: 2026-10-04. Ejecutado por Claude (no Cline) a pedido del usuario, con las
decisiones recomendadas (bloque DECISIONES del prompt). Base: `b184b01`. El prompt
está en `docs/historial/prompts/PROMPT_V_DOCUMENTACION_PARA_IA.md` y su porqué en
`docs/historial/auditorias/RETRO-AUDITORIA-DOCS-IA-2026-10-04.md`.

**Cómo leer este informe.** Cada parte pasó por tres agentes: un **implementador**
que hizo el cambio sin commit, un **auditor** independiente que lo revisó contra el
CONTRATO (`docs/normativo/CONTRATO-DE-CAMBIO.md` §2 y §3) y la filosofía, y un
**cierre** que aplicó los ajustes de la auditoría, volvió a validar y firmó el
commit. Cada sección de parte tiene las 7 subsecciones de la DECISIÓN 2: qué se
hizo, quién y con qué límites, cómo se midió, qué normas respetó, el veredicto
frente a la filosofía y la arquitectura, las desviaciones y lo que queda sin
verificar. El «Resumen» lo rellena el cierre final, cuando estén todas las partes.
Las cifras son fotos del 2026-10-04: la fuente viva es el script que las mide.

## Resumen

| Parte | Estado | Commit | Agentes | Veredicto filosofía |
|---|---|---|---|---|

---

## Parte A — Las herramientas de contexto fallan en voz alta

**Estado:** COMPLETA · **Commit:** el que contiene este informe («Prompt V, Parte A: …»; el sha va en el Resumen) · **Auditoría:** ACEPTAR_CON_CAMBIOS (los 2 ajustes, aplicados en el cierre)

### 1. Qué se hizo

| Archivo | Cambio | Ítem |
|---|---|---|
| `scripts/verificar-docs.mjs` | `pesa()` lee el Buffer y resta los bytes `0x0D`: mide lo versionado, igual que el CI. Línea fechada nueva bajo el párrafo de `TECHO_TOKENS` (el párrafo no se editó). `TECHO_TOKENS` sigue en 10500 | A1 |
| `scripts/gen-contexto.mjs` | `leer()` pasa CRLF → LF. `\` → `/` en las rutas, una vez, al leer los argumentos. `--tarea` por palabra completa y sin tildes (NFD); si una no casa, exit 1 con la lista de tareas válidas. Exit 1 si el presupuesto da 0 filas o si falta el CONTRATO (rama cline). `reglasOrden()` devuelve `null` si test-orden falla, y la rama claude escribe «no se pudo leer test-orden» | A2 |
| `scripts/gen-contexto.mjs` | `--salida` solo bajo `docs/historial/prompts/`; no pisa un archivo existente sin `--forzar` y nunca una carpeta. Cabecera JSDoc actualizada (QUÉ ESCRIBE y SALE CON 1) | A3 |
| `scripts/diag-peso-cambio.mjs` | `:262` desestructura `irreversible` (ya lo devolvía `pesar()`) | A4 |
| `scripts/README.md` | Fila de `gen-contexto.mjs`: `--salida=docs/historial/prompts/X.md`, `--forzar` y los casos de exit 1 | Ajuste 1 de la auditoría (cierre) |
| `docs/historial/informes/INFORME-PROMPT-V.md` | Este informe (DECISIÓN 4) | Cierre |

Diff de los scripts, sin contar los CR: +137/−28 (README incluido).

### 2. Quién lo ejecutó y qué pudo / no pudo hacer

| Agente | Rol | Pudo | No pudo y por qué |
|---|---|---|---|
| Claude (Opus 5.5), implementador | Hacer A1-A4 en lugar de Cline, sin commit | Leer el repo y `docs/historial/`; correr la VALIDACIÓN y `test:ci` antes y después; probar los fallos en una copia aislada del scratchpad, con la versión de `b184b01` como control positivo | Reproducir en el árbol real el fallo CRLF del CONTRATO, el presupuesto vacío o test-orden ilegible: habría que editar normativos o mover scripts. Comprobar la cifra en el CI de GitHub: no hay push. Tocar `scripts/README.md`: la parte no lo nombra (CONTRATO §2, alcance) |
| Claude, auditor independiente | Revisar contra CONTRATO §2/§3, las REGLAS de A y la filosofía | Re-ejecutar la VALIDACIÓN, `tsc`, eslint de los 3 scripts y los `--check`; repetir los fallos en su propia copia; comparar byte a byte el paquete de Cline nuevo con el de `b184b01` en 5 casos válidos | Re-ejecutar el build: lo dejó al cierre, porque `app/` no importa los `.mjs`. Corregir: un auditor no edita, solo propone (2 issues de severidad baja) |
| Claude, cierre | Aplicar la auditoría, re-validar, informe y commit | Editar `scripts/README.md` (ajuste 1) y corregir en este informe la frase de `cambio`/`cualquier` (ajuste 2); repetir la VALIDACIÓN completa y `test:ci`; commit con rutas concretas | Push: lo prohíben las reglas duras. Incluir el prompt V y la RETRO, que siguen sin seguimiento: no son archivos de la parte |

Ninguno de los tres tocó la base de datos, la red, `scripts/_peligrosos/`, `scripts/_archivo/`, `fase10-*` ni los 7 cambios ajenos del árbol.

### 3. Cómo se ejecutó y se midió

| Comando de VALIDACIÓN | Antes (`b184b01` + ajenos) | Después (cierre) |
|---|---|---|
| `npm run verificar:docs` | exit 0 · 10 485 tokens con CR (techo 10 500, margen aparente 15) | exit 0 · **10 345** tokens sin CR, igual que el CI · 0 rutas muertas |
| `gen-contexto --tarea=inexistente lib/auth/types.ts` | exit 0 y la misma salida que sin `--tarea` | exit 1 · mensaje y lista de las 13 tareas |
| `gen-contexto --tarea=sintoma lib/escolar/ciclo/calendario.ts` | exit 0 sin «Localizar un bug… síntoma» (la fila de ciclo salía solo por la sugerencia automática) | exit 0 con esa fila · idéntico byte a byte a `--tarea=síntoma` |
| `gen-contexto "app\actions\asistencias.ts"` | exit 0 sin «Tocar permisos…» | exit 0 con «Tocar permisos…» · idéntico a la ruta con `/` |
| `diag-peso-cambio lib/auth/permisos.ts` | «→ **Claude**» y luego `ReferenceError: irreversible`, exit 1 | exit 0 · TOTAL 3/14 → **Claude** («toca la AUTORIZACIÓN») · `--calibrar` sigue en 7/8 |
| `npm run test:ci` | EXIT 0 | EXIT 0 · 51/51 suites · test-orden 17 reglas OK · test-permisos 738/0 · auditoría de permisos 309/0 · `--check` de matriz, invariantes y rumbo al día · `verificar:estado` OK · build OK · lint: 1 aviso previo (`gen-panel.mjs:41` `MARCA`), ninguno nuevo |

**Tokens del arranque**: 10 485 con CR → 10 345 sin CR. Delta contra la base LF: **0**, porque no se tocó ninguno de los 8 archivos del arranque; la bajada de 140 sale solo de medir sin CR. Margen real hasta `TECHO_TOKENS = 10500`: **155**. El prompt decía «~10 344»; la cifra exacta es 10 345 por el redondeo por archivo.

**Casos de fallo**, probados en una copia aislada con la versión de `b184b01` como control:

| Caso | `b184b01` | Ahora |
|---|---|---|
| CONTRATO en CRLF | exit 0 con «(no se pudo leer CONTRATO-DE-CAMBIO.md §1)» | exit 0 y el paquete lleva el CONTRATO |
| CONTRATO sin bloque | exit 0 con el paquete sin CONTRATO | cline: exit 1 · claude: exit 0 (no lo usa) |
| Encabezado del presupuesto renombrado o sin `00-INDICE.md` | exit 0 con la lista vacía | exit 1 (también con `--tareas`) |
| Sin `scripts/test-orden.mjs`, `--agente=claude` | afirmaba «Ninguna regla… arrastra deuda viva» | «no se pudo leer test-orden» en las dos secciones |
| `--salida` fuera de `docs/historial/prompts/`, con `..`, absoluta, la carpeta, vacía o en una subcarpeta inexistente | escribía donde fuera | exit 1, sin escribir nada |
| `--salida` a un archivo existente | lo pisaba | exit 1 sin `--forzar`; con `--forzar` lo sobrescribe |

El paquete de Cline para entradas válidas es **idéntico byte a byte** al de `b184b01` en 5 casos (lo comprobó el auditor): no cambió contenido fuera de A.

### 4. Qué normas respetó

| Norma (CONTRATO §2 / §3) | Cumple | Evidencia |
|---|---|---|
| Ajenos intactos (reglas duras) | sí | Diff vacío con `--ignore-cr-at-eol --ignore-blank-lines` sobre los 7; el commit lleva solo rutas concretas |
| RESULTADO A1 | sí | 10 345 = suma de los blobs de HEAD / 4; párrafo fechado intacto y línea nueva debajo; techo sin tocar |
| RESULTADO A2: CRLF, exit 1 sin CONTRATO, con 0 filas o `--tarea` sin fila | sí | Copia aislada con control positivo; en el repo, `--tarea=inexistente` da exit 1 |
| RESULTADO A2: palabra completa y NFD | sí | `sintoma` = `síntoma`; `modificar`, `migracion`, `legacy`, `decision` y `permiso` dan exit 1; `ui` casa con la fila de apariencia y no con «arquitectura» |
| RESULTADO A2: `\` → `/` una vez | sí | Salida idéntica con `\` y con `/`; `capaDe`/`suitesDe` ya no normalizan por su cuenta |
| RESULTADO A2: rama claude sin test-orden | sí | «no se pudo leer test-orden»; ya no afirma «ninguna deuda» |
| RESULTADO A3 | sí | 10 rutas inválidas con exit 1; el hash del prompt V no cambió |
| RESULTADO A4 | sí | exit 0 y veredicto Claude; `:235` no usa `irreversible` |
| REGLAS de A: sin cambiar el paquete fuera de A, sin dependencias | sí | 5 paquetes idénticos byte a byte; ningún import nuevo |
| §2 Alcance: solo lo pedido | sí | Los 3 scripts de A + la fila del README que pidió la auditoría + este informe |
| §2 Alcance: legacy en pie (R8) | sí | No se borra nada; siguen el agente por defecto `cline` y el campo `claves` |
| §2 Alcance: sin fuente paralela (R6) | sí | Todo se lee de `00-INDICE`, CONTRATO §1 y `test-orden --json` |
| §2 Capas | n/a | Solo `scripts/`; no toca `lib/`, `app/` ni actions |
| §2 Datos | n/a | Sin esquema, sin base, sin `supabase/` |
| §2 Identidad | n/a | No toca dominio |
| §2 Verificación: tsc, suites, build | sí | `test:ci` en verde en el cierre (incluye los tres) |
| §2 Verificación: medición antes y después con el mismo script | sí | Tabla de la sección 3 |
| §2 Verificación: nada de `_peligrosos/` ni `_archivo/` | sí | Solo scripts de solo lectura permitidos |
| §2 Documentación: ESTADO-ACTUAL y MAPA §2 | n/a | No cambia ninguna regla estructural ni cierra deuda de `pendientes.json` |
| §2 Documentación: informe en `docs/historial/informes/` | sí | Este archivo (DECISIÓN 4) |
| ORDEN §4: `scripts/README.md` describe el contrato del script | sí | Era «no» en la auditoría; corregido en el cierre (ajuste 1) |
| §3 Motivos de rechazo inmediato | sí | Ninguno: sin `_peligrosos/`, sin migración, sin segunda fuente, con medición; la única cifra a mano es la línea fechada que pide A1 |
| Umbrales, `TECHO_TOKENS` y regeneradores | sí | 17 reglas OK; los `--check` al día; no se tocó `pendientes.json` ni ninguna Server Action |
| Finales de línea | sí | `gen-contexto` y `verificar-docs` en CRLF en el árbol; `diag-peso-cambio` y `README` en LF; `git diff --check` limpio |

### 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto | Nota |
|---|---|---|
| R6 / §15: fuente única | respeta | El script sigue sin reescribir nada; si la fuente falta, ahora se para en vez de inventar una lista vacía. El README ya no describe un uso que falla |
| §16: medir antes y después | respeta | Antes y después de todos los comandos, más los fallos con control positivo; el cierre lo repitió |
| R8: el legacy no se retira antes de tiempo | respeta | `cline` por defecto (por los prompts archivados) y `claves` (lo usan las sugerencias automáticas, que son de la Parte E) |
| Reutilizar antes de crear | respeta | A4 usa el `irreversible` que `pesar()` ya devolvía; `listaTareas()` sirve a `--tareas` y al error |
| No aflojar umbrales ni `TECHO_TOKENS` | respeta | Medir sin CR no afloja: el CI ya medía 10 345, y ahora local y CI coinciden |
| Economía del arranque | respeta | Delta 0, margen 155 |
| ORDEN §4: dónde va cada cosa | respeta | Cambios dentro de los scripts, cabecera JSDoc y fila del inventario alineadas |
| Fallar en voz alta (objetivo de la parte) | respeta | Cada caso que antes daba exit 0 con un resultado incompleto sale con 1 y un mensaje, o está corregido |
| Capas e identidad | n/a | Herramientas de documentación, sin dominio |

**Veredicto global:** la Parte A sigue la filosofía y la arquitectura del repo; lo único que cambia es que las herramientas, cuando no pueden leer su fuente, lo dicen y se paran.

### 6. Desviaciones y decisiones propias

**Desviaciones**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| A4: el ESTADO cita `:262` y `:235` | Solo `:262` | `irreversible` solo se usa después de `:262`; en `:235` (bucle de `--calibrar`) sería una variable sin usar y eslint avisaría |
| Validación «`--tarea=sintoma` casa síntoma» | Ningún cambio de código; aclaración | Antes ya salía la fila de ciclo, pero por la sugerencia automática; la de «síntoma» no salía y ahora sí |
| Fallo CRLF del CONTRATO | Probado en una copia aislada | En esta copia el CONTRATO está en LF; no se cambian los finales de un normativo solo para probar |
| Fila de `gen-contexto` en `scripts/README.md` | La editó el cierre, en el commit de A | La pidió la auditoría (ajuste 1): la B5 no recoge esa fila y quedaría describiendo un uso que ahora sale con 1 |

**Decisiones propias del implementador**
- `pesa()` resta todos los `0x0D`, no solo los de `\r\n`: local y CI coinciden aunque un archivo se versione con CRLF.
- `--tarea` casa si sus palabras aparecen **enteras y seguidas** en el nombre de la fila. Admite tareas de varias palabras («ciclo escolar», «Server Action»), y el singular «permiso» ya no casa con «permisos».
- **Corregido en el cierre (ajuste 2)**: el implementador escribió que «cambio» y «cualquier» solo casan con la fila 0. No es así: por palabra completa, «cambio» casa también con «Auditar un cambio antes de aceptarlo», y «cualquier» con «Ejecutar cualquier script» (comprobado: cada una añade esa fila). Las palabras vacías («o», «de», «un») casan con varias filas; es inocuo, pero conviene saberlo.
- Las comprobaciones de `--tarea` y del CONTRATO van al leer los argumentos: el script falla pronto y nunca escribe a medias. La de 0 filas corta también `--tareas`.
- La comprobación del CONTRATO solo aplica a la rama cline; la claude no lo usa.
- `reglasOrden()` devuelve `null` (no `[]`) si test-orden falla, si el JSON es inválido o si no trae reglas.
- `--salida`: `\` → `/`, `path.resolve` y `path.relative` dentro de la carpeta; error claro si la subcarpeta no existe; una carpeta nunca se sobrescribe, ni con `--forzar`.
- La normalización de rutas se hace una sola vez; se quitó el `replace` redundante de `capaDe()` y `suitesDe()`, sin cambio en la salida.
- Si falta `00-INDICE.md` o el CONTRATO, `presupuesto()` y `contrato()` devuelven vacío o `null` en vez de lanzar ENOENT, para salir con el mensaje claro.

**Nota para la Parte E.** Si E1(g) («es tarea de Claude») se implementa mirando la fila casada, `--tarea=cambio --agente=cline` daría ese error, porque «cambio» casa con «Auditar un cambio…». E1(g) debe comprobar el literal pedido (auditar o prompt), o asumir ese caso a propósito. Las 11 tareas de la tabla E2 ya son válidas, y `ui` cumple el caso negativo tal como está escrito.

### 7. Lo no verificado y lo pendiente

| Qué | Estado | Por qué / quién |
|---|---|---|
| La cifra 10 345 en el CI real de GitHub | no verificado | No hay push. La equivalencia sale de la suma de los blobs de HEAD y de la cifra del ESTADO ACTUAL del prompt |
| Los fallos (CRLF, presupuesto vacío, test-orden ilegible) en el árbol real | verificado solo en copia | Reproducirlos exigiría editar normativos o mover scripts |
| Suite propia de `gen-contexto` | pendiente | La crea la Parte E (E2) |
| `docs/historial/prompts/PROMPT_V_DOCUMENTACION_PARA_IA.md` y la RETRO | sin seguimiento | No son archivos de la parte; que decida el cierre final si van en un commit |
| Aviso de lint en `gen-panel.mjs:41` (`MARCA`) | previo | Ajeno a la Parte A |
| `--tarea=cambio` con E1(g) | a vigilar | Ver la nota para la Parte E en la sección 6 |
