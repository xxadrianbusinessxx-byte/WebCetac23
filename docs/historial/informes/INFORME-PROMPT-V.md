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

---

## Parte B — Scripts: ni secretos en la salida ni una cuarentena que se pueda desarmar

**Estado:** COMPLETA · **Commit:** el que contiene este informe («Prompt V, Parte B: …»; el sha va en el Resumen) · **Auditoría:** ACEPTAR_CON_CAMBIOS (el issue medio y los dos bajos de `test-orden`, aplicados en el cierre; el de `MAPA:90` queda para D1)

### 1. Qué se hizo

| Archivo | Cambio | Ítem |
|---|---|---|
| `diag-credenciales-duplicadas.mjs` | CLAVE de profesores y alumnos y CURPs → grupo A, B… con su recuento; la CURP sale `[oculta]` | B1 |
| `verificar-login-credenciales-iniciales.mjs` · `verificar-credenciales-iniciales.mjs` | contraseña y CURP → `[oculta]`; cada fila se nombra por los 8 primeros caracteres de `tutor_id` | B1 |
| `6j-verificar-password-tutor.mjs` | CURP del tutor y del alumno, contraseña inicial y el valor que coincide → `[oculta]` o el nombre del campo | B1 |
| `diagnostico-login-tutor.mjs` | `clave=` y `curpAlumno` → `[oculta]`; la cabecera ya no dice «NO expone contraseñas» sin serlo | B1 |
| `migrar-marcar-claves-compartidas-profesores.mjs` | CLAVE por profesor (también en el dry-run) → `[oculta]` con su grupo; la cabecera, sin los valores | B1 |
| `migrar-crear-tecnico.mjs` · `migrar-crear-administracion.mjs` | técnico: sin el literal de la clave, exige `--clave=` (≥ 6) antes de leer `.env.local` y no la imprime; administración: no repite la que llega por `--clave=` | B1 |
| `6i-diagnostico-login-tutor.mjs` · `diag-profesor-alcance.mjs` · `probe-profesores-data.mjs` · `probe-materias-alumnos.mjs` | 6i: la contraseña literal de un tutor real pasa a `--pw=`; alcance: `profesor_clave` (la CLAVE) solo como recuento; los dos probes: volcados con CLAVE y CURP → `[oculta]` | B1 (extra) |
| `scripts/_peligrosos/*.mjs` (23) | +1 línea: `throw new Error("CUARENTENA: …")` como primera sentencia tras los `import` | B2.1 |
| `scripts/test-orden.mjs` | C18 nueva (DURA, fuente crudo, falla también con la carpeta vacía); C6 ve el método HTTP sobre el fuente sin comentarios y con cadenas (`codigoDesnudo({ conservarCadenas })`), con la excepción nominal `C6_RPC_DE_LECTURA`; C10 apretado de 34 a 19 | B2.2 · B4 · B5 |
| `scripts/test-orden.mjs` | C18: el `import` acaba en su especificador, no en el primer `;`. C6: `rpc(variable)` quita la exención; el método se ve con backtick, con la clave entre comillas y en cualquier caja. Las comillas de esas regex van como `\x22`, `\x27` y `\x60` | Cierre (issues bajos 2 y 3) |
| `.clineignore` | `+ scripts/_peligrosos/`; fuera la línea `contexto.feliz` (ruta inexistente) | B2.3 |
| `fase10-carga.mjs` · `fase10-perfil-datos.mjs` | carga: `--confirmar-carga` en `:30`, antes de `.env.local` (`:65`) y del primer `fetch` (`:122`); `--x=v` y `--x v`. Perfil: cabecera `--runs=N`; panel directivo con la consulta de la app (`SELECT_TUTOR` copiada con cita, `order(created_at desc)`, credenciales en lotes de 50) | B3 |
| `scripts/README.md` | `CARGA`; una etiqueta por `gen-`; filas propias (3 probes de PATCH, `fase10-*`, `6j`, `diag-sql-aplicado`, `diagnostico-login-tutor`, la serie `f0…f8` por nombre); sin cifras derivables; la sospecha remite a ESTADO §5; «sin fila = `ESCRIBE`»; regla de credenciales | B1 · B5 |
| `scripts/README.md` | La regla se amplía a todo script que imprima una CURP, y 12 filas lo marcan: «salida sensible: no ejecutar desde Cline (imprime CURPs)» | Cierre (issue medio 1) |
| `RUMBO.md` | Regenerado en el cierre sobre `19dc335`: publica C10 = 19 | B5 |
| `docs/historial/informes/INFORME-PROMPT-V.md` | Esta sección | Cierre |

Diff de la parte sin contar los CR ni este informe: 41 archivos, +310/−97 (`test-orden` +99/−8, README +55/−32).

### 2. Quién lo ejecutó y qué pudo / no pudo hacer

| Agente | Rol | Pudo | No pudo y por qué |
|---|---|---|---|
| Claude (Opus 5.5), implementador | Hacer B1-B5 en lugar de Cline, sin commit | Leer código e historial para diagnosticar; medir antes y después; mutar `test-orden` con copia byte a byte y restaurarlo (comprobado con `cmp`); `node --check` de los 38 scripts editados; probar aislado el parser de `fase10-carga`; `test:ci` | Ejecutar los scripts editados (credenciales, `_peligrosos/`, `fase10`, probes): lo prohíben la cabecera y la parte. Confirmar en la base que la RPC desplegada es la del `.sql`. Decidir si se enmascaran las CURPs de los diagnósticos operativos: cambia herramientas, lo dejó para Claude o el usuario |
| Claude, auditor independiente | Revisar contra CONTRATO §2/§3, las REGLAS de B y la filosofía | Repetir la VALIDACIÓN barata, el control positivo de B4 y los `--check`; revisar el diff línea a línea; probar en el scratchpad los dos huecos (import sin `;`, `rpc(variable)`) y su arreglo | Corregir: un auditor solo propone (1 issue medio, 3 bajos). Ejecutar scripts que conectan a Supabase |
| Claude, cierre | Aplicar la auditoría, re-validar, informe y commit | Marcar las 12 filas y ampliar la regla (issue 1); endurecer C18 y C6 (issues 2 y 3) y probarlos aislados con los casos del auditor; regenerar RUMBO; VALIDACIÓN completa y `test:ci`; commit con rutas concretas | Editar el MAPA (issue 4): es de D1. Push: prohibido. Enmascarar las CURPs operativas: decisión del usuario (ver §6) |

Ninguno de los tres ejecutó un script de `_peligrosos/`, `_archivo/`, `fase10-*` ni de credenciales, ni conectó con Supabase, ni tocó los 7 archivos ajenos.

### 3. Cómo se ejecutó y se midió

Orden del implementador: MEDICIÓN → B1 → B2 (throw → C18 en verde → `.clineignore`) → B3 → B4 (control positivo antes de declarar la excepción) → B5 → C10 → `gen-rumbo` → VALIDACIÓN. El cierre: issues → `test-orden` antes/después con el mismo comando → VALIDACIÓN → `test:ci`.

| Medición | Antes (sin B) | Después (cierre) |
|---|---|---|
| `node scripts/test-orden.mjs --detalle` | 17 reglas OK. C6 = 0, pero solo miraba `.insert/.update/.upsert/.delete/.rpc(`. C10 34/34. C11 21/21 | 18 reglas OK. C6 = 0 viendo también el método HTTP. **C10 19/19**. C11 21/21. **C18 = 0**. Con los arreglos del cierre, salida idéntica a la de antes de aplicarlos |
| `git grep -niE "console…(clave\|contrase\|password\|inicial\|curp)"` (vivos) | 94 líneas; 9 scripts de credenciales imprimían valor o CURP, 2 probes volcaban filas con CLAVE y 6i tenía como literal la contraseña de un tutor real | 97 líneas revisadas: ningún script de credenciales imprime valor ni CURP. Quedan `clave_tutor` (público), la clave al azar de administración (una vez, si se generó) y CURPs en 13 scripts operativos, marcados en 12 filas del README |
| Control positivo de B4 (método HTTP sin excepción, 93 scripts vivos) | 1 hallazgo: `diag-materias-alumno.mjs:37` POST, la RPC de lectura `obtener_perfil_alumno` | El mismo hallazgo, también con la regex ampliada del cierre |
| `git grep -L "CUARENTENA" -- scripts/_peligrosos/` | los 23 | vacío |
| `git grep -n "confirmar-carga" scripts/fase10-carga.mjs` | nada | comprobación en `:30`; `.env.local` en `:65`; primer `fetch` en `:122` |
| `node scripts/gen-rumbo.mjs --check` | al día | al día (regenerado sobre `19dc335`, C10 = 19) |
| Tokens del arranque (`verificar:docs`) | 10 345 | **10 347** (+2, solo por RUMBO); techo 10 500 sin tocar; 0 rutas muertas |
| `npm run test:ci` | verde | **verde, exit 0**: tsc; lint 0 errores y 1 aviso previo (`gen-panel.mjs:41`); 51/51 suites; test-permisos 738/0; auditoría de permisos 309/0; `--check` de matriz, invariantes y rumbo al día; `verificar:estado` OK; `verificar:docs` OK; build OK |

**Pruebas de que los guardianes muerden** (implementador con mutaciones en el árbol, restauradas; cierre con las funciones extraídas de `test-orden.mjs` y probadas aparte):

| Caso | Resultado |
|---|---|
| Sin la línea `throw` / con una sentencia antes / comentarios entre imports y `throw` | C18 falla / falla / pasa |
| `import fs from "node:fs"` sin `;` + `fetch` con DELETE + `throw` (hueco del auditor) | antes del cierre pasaba; **ahora falla** |
| Import sin `;` seguido del `throw` · import de efecto lateral · shebang con CRLF | pasa · pasa · pasa |
| `diag-materias-alumno` con `rpc("eliminar_ciclo")` / con `const n = "eliminar_ciclo"; rpc(n)` | C6 falla / antes del cierre pasaba, **ahora falla** |
| Método con backtick · `"method": "DELETE"` · `method: "patch"` | antes no se veían; **ahora C6 los marca** |
| Método en comentarios · `GET` · `POSTER` | no marca nada |

### 4. Qué normas respetó

Del checklist del auditor; la columna «Cumple» es la suya, con lo que hizo el cierre donde cambió algo.

| Norma (CONTRATO §2 / §3) | Cumple | Evidencia |
|---|---|---|
| B1 · líneas citadas: `[oculta]`, grupos opacos con recuento, nunca una función del valor | sí | `etiqueta()` es un índice por orden; diff revisado línea a línea |
| B1 · cabecera de `diagnostico-login-tutor`, `--clave=` en el técnico, README:155 con recuentos, regla en Clasificación | sí | `--clave=` antes de `.env.local`; el literal ya no está en el árbol; «19, en dos grupos: 16 y 3» |
| B2 · `throw` en los 23, regla DURA sobre el fuente crudo, `.clineignore` | sí | `git grep -L` vacío; C18 = 0. El hueco del import sin `;` se cerró en el cierre |
| B3 · `--confirmar-carga` antes de `.env.local` y de todo `fetch`; ambas formas; perfil alineado | sí | `:30` < `:65` < `:122`; consulta idéntica a `tutores-credenciales.ts` |
| B4 · método HTTP sobre fuente con cadenas, exclusión solo en esa detección, excepción con motivo, control positivo | sí | Control repetido por auditor y cierre: solo `diag-materias-alumno:37`. El hueco de `rpc(variable)` se cerró en el cierre |
| B5 · etiquetas, filas, sin cifras, ESTADO §5, «sin fila = ESCRIBE», C10 ≤ 21 y RUMBO | sí | C10 = 19; RUMBO publica 19 y va en el commit |
| OBJETIVO 1 y VALIDACIÓN · «ninguno imprime valor ni CURP» | no → **estrechado y marcado en el cierre** | Los de credenciales cumplen. 13 operativos siguen imprimiendo CURPs; su fila lo marca y la decisión queda para el usuario (§6) |
| §2 Alcance: solo lo pedido, extras justificados | sí | Extras dentro del OBJETIVO (§6) |
| §2 Alcance: legacy en pie (R8) | sí | Sin borrados ni `git mv` |
| §2 Alcance: sin fuente paralela (R6) | sí | Sin módulo común de enmascarado; `SELECT_TUTOR` copiada con cita (inevitable: `server-only`) |
| §2 Capas · Datos · Identidad | n/a | Solo `scripts/` y documentación; sin esquema ni lógica de identidad |
| §2 Verificación: tsc, suites, build, medición antes/después | sí | Tabla de la sección 3 |
| §2 y §3 · nada de `_peligrosos/` ni `_archivo/` ejecutado; sin migración; sin cifras a mano | sí | Validación estática; la cifra de C10 la publica `gen-rumbo` |
| Reglas duras · ajenos intactos, índice vacío, finales de línea | sí | Diff de los 7 ajenos vacío con `--ignore-cr-at-eol --ignore-blank-lines`; `git add` con rutas concretas; `test-orden` sigue en CRLF (694/694) y el README en LF |
| `TECHO_TOKENS` y umbrales | sí | 10 500 intacto; C10 34 → 19; C6 y C18 duras en 0 |
| §2 Documentación (ESTADO, MAPA §2, informe) | sí | B no cambia nada que recojan; la línea de ORDEN es de C8; este informe |

### 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto | Nota |
|---|---|---|
| R6 / §15 · fuente única | respeta | El README pierde cifras en vez de actualizarlas; C10 lo publica `gen-rumbo`; la copia de `SELECT_TUTOR` está citada |
| §16 · medir antes y después con el mismo instrumento | respeta | Misma batería antes y después; el cierre comparó `test-orden --detalle` y `--json` antes y después de sus arreglos: idénticos |
| R8 · el legacy no se retira | respeta | Los 23 de `_peligrosos/` se conservan, desarmados |
| Reutilizar antes de crear | respeta | `codigoDesnudo` gana una opción; la excepción sigue el patrón de `ONCONFLICT_NO_LITERAL_PERMITIDO` |
| No aflojar umbrales ni `TECHO_TOKENS` | respeta | C10 baja a 19; C18 nace dura |
| Economía del arranque | respeta | +2 tokens, solo por RUMBO |
| ORDEN · dónde va cada cosa | respeta | Regla en `test-orden`, inventario en el README, exclusión en `.clineignore`; la línea normativa, en C8 |
| Guardianes que fallan en voz alta | respeta | Los dos matices del auditor (import sin `;`, `rpc(variable)`) están cerrados; una forma de import que C18 no reconoce hace fallar la regla, no la deja pasar |
| Ninguna salida de diagnóstico expone credenciales | respeta en parte | Los de credenciales, sí. Los operativos siguen imprimiendo CURPs, ahora con la marca y la decisión pendiente |

**Veredicto global:** la Parte B sigue la filosofía y la arquitectura del repo: convierte dos reglas en prosa (la cuarentena y «los diagnósticos no escriben») en guardianes mecánicos que muerden; el único objetivo que queda a medias, el de las CURPs, está a la vista y espera una decisión.

### 6. Desviaciones y decisiones propias

**Desviaciones**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| B1 más allá de las líneas citadas | CURPs de `diag-credenciales:98`, `6j:60/:90`, `verificar-credenciales-iniciales:37`; `diag-profesor-alcance:63`; los volcados de dos probes; el eco de `--clave=` en administración; el literal de 6i → `--pw=` | El OBJETIVO pide que ningún diagnóstico imprima una credencial; el grep no ve volcados ni literales |
| B5 · etiqueta propia también en `gen-panel`, `gen-matriz-permisos`, `gen-invariantes` y `gen-seccion4` | Cada uno dice lo que escribe | También escriben y figuraban como `LEE(fs)` o sin etiqueta |
| B3 · también la consulta de tutores de `fase10-perfil-datos` | `SELECT_TUTOR` + `order(created_at desc)` | El panel directivo lanza las dos consultas |
| README · «Con guarda (de escritura o de carga)» y la fila de `test-orden` sin «Diecisiete reglas» | Título y texto | `fase10-carga` tiene guarda pero no escribe; la cifra quedaba falsa con C18 |
| C18 falla con `_peligrosos/` vacío · el técnico exige `--clave=` sin generar una al azar | — | Un guardián que mide 0 no protege; generar la clave obligaría a imprimirla |
| **OBJETIVO 1 estrechado (cierre)** | Los 13 scripts que imprimen CURPs sin ser de credenciales se **marcan**, no se enmascaran: `7-diagnostico-materias-alumnos`, `diag-alcance-tutor`, `diag-inscripciones-duplicadas`, `-reactivacion`, `-vs-roster`, `diag-materias-alumno`, `diagnostico-ciclo-activo-bug`, `p0-verificar-restauracion`, `probe-curp`, `probe-materias-alumnos` y `probe-schema-tabla` (en la fila de los probes), `migrar-deduplicar-inscripciones` y `migrar-marcar-decision-manual` | La CURP es credencial (la CLAVE del alumno son sus 6 últimos caracteres, `claveDesdeCurp`; la contraseña inicial del tutor, los 8 últimos). Pero enmascararla cambia herramientas operativas (cruce con el roster, deduplicar) y no se pueden ejecutar para comprobarlas. El riesgo concreto es que la salida entre en el contexto de Cline, y la marca lo cubre |

**Decisión pendiente para el usuario:** en los diagnósticos `LEE`, (a) sustituir la CURP por nombre + grupo o por el id de la fila, o (b) conservarla con la marca, como ahora. En los dos `migrar-*` y en `probe-curp` la CURP es la clave de trabajo: lo razonable es (b).

**Decisiones propias**
- Implementador: C18 salta shebang, comentarios e `import` (no `import(` ni `import.meta`) y compara la primera línea con `trimEnd`. La excepción de C6 solo exime un POST a `/rest/v1/rpc/` si todas las RPC del archivo están declaradas. Etiquetas opacas de una línea por script (sin módulo común) y sin imprimir la longitud. C10 apretado a lo medido (19), no a 21.
- Cierre: en C18, el `import` termina en su especificador con `;` opcional, y una forma que no reconoce devuelve −1 (C18 falla). En C6, cualquier `rpc(` con nombre no literal quita la exención, y la regex de método admite backtick, clave entre comillas y cualquier caja. Las comillas de esas regex se escriben `\x22`, `\x27`, `\x60` para no desalinear el escáner de `test-orden.mjs`, que C6 también recorre (es un `test-`). RUMBO, regenerado justo antes del commit.

**Para D1** (issue bajo 4, no se edita aquí): `docs/sistema/MAPA-DEL-SISTEMA.md:90` manda a `diagnostico-login-tutor.mjs` y `verificar-login-credenciales-iniciales.mjs`, que ahora son «salida sensible: no ejecutar desde Cline». Añadir «(salida sensible: los ejecuta Claude o una persona)». En `:93`, `6i-diagnostico-login-tutor.mjs` pide ahora `--pw=`.

### 7. Lo no verificado y lo pendiente

| Qué | Estado | Por qué / quién |
|---|---|---|
| Las salidas enmascaradas, la guarda de `fase10-carga` y la consulta de `fase10-perfil-datos` en vivo | no verificado | Ejecutarlos está prohibido; validación estática (`node --check`, diff, parser aislado, mutaciones) |
| Que la `obtener_perfil_alumno` desplegada sea solo SELECT | no verificado | Sin acceso a la base; la excepción de C6 se apoya en el `.sql` del repo |
| Cambio de clave del técnico y del tutor de 6i | pendiente, de persona | Sus literales salieron del árbol pero siguen en el historial (`b184b01`); purgarlo es destructivo. Confirmar o forzar el cambio |
| CURPs reales en el repo: 5 CSV de `scripts/_archivo/` (~1 250 líneas), fixtures de `test-rediseno-oceano.mjs:652-653` (una da la contraseña inicial del tutor de 6i), 7 probes de `_peligrosos/`, `docs/historial/` | pendiente, decisión | Ocultarlas en la salida protege poco mientras el repo las tenga: la medida real es rotar las claves derivadas de la CURP |
| La clave compartida de profesores publicada en ESTADO-ACTUAL, GLOSARIO, CONTRATO, MAPA y REGLAS | pendiente | El «grupo A (16)» de `diag-credenciales` se invierte leyendo el arranque; la mitigación es el pendiente `claves-compartidas-profesores` (forzar el cambio) |
| Enmascarar las CURPs de los 13 operativos | decisión del usuario | Ver §6 |
| «`probe-*` (los 16 que quedan aquí)»: hoy son 17 | pendiente | Parte C (ninguna cifra derivable a mano) |
| «hoy faltan 35» (C10) y «las once reglas» en `test-orden.mjs` | pendiente | Parte D5 |
| Filas de `6i-listar-tutores`, `6k-verificar-clave-tutor` y 17 `probe-*` | deuda de C10 (19) | No lo pedía la parte |
| Línea normativa de la cuarentena en ORDEN · `MAPA:90` y `:93` | pendiente | C8 · D1 |
| `6j-verificar-password-tutor.mjs:30` usa por defecto el usuario (nombre real) de una tutora | sin tocar | No es credencial |
| El escáner de `test-orden` no entiende literales de regex | a vigilar | Hoy 0 falsos positivos en 93 scripts vivos; las regex nuevas no llevan comillas literales |
| Un `import … with { type: "json" }` en `_peligrosos/` haría fallar C18 | a vigilar | Falla en voz alta, no deja pasar; ninguno de los 23 lo usa |

---

## Parte C — Una sola verdad en el arranque y en las normas

**Estado:** COMPLETA · **Commit:** el que contiene este informe («Prompt V, Parte C: …»; el sha va en el Resumen) · **Auditoría:** ACEPTAR_CON_CAMBIOS (4 issues bajos: los tres primeros, aplicados en el cierre; el cuarto, en su forma mínima, y la unificación de `criterios.prompts` §26 queda para D)

### 1. Qué se hizo

| Archivo | Cambio | Ítem |
|---|---|---|
| `docs/historial/BITACORA-2026-09.md` | Sección nueva «Incidente P0 — movido de REGLAS_NO_HACER (2026-10-04)» con la copia literal de `b184b01:REGLAS_NO_HACER.md:13-36` y `:186-214` (comparada con diff: idéntica) | Pre-paso PARA CLAUDE |
| `docs/sistema/pendientes.json` · `RUMBO.md` | Objeto `inscripciones-2do-a-rh` literal, tras `filas-sin-periodo`; RUMBO regenerado en el mismo paso | C1 |
| `scripts/verificar-docs.mjs` | Línea fechada con la DECISIÓN 1 bajo la de A1. `TECHO_TOKENS` sigue en 10500 | C0 |
| `docs/normativo/REGLAS_NO_HACER.md` | Cabecera del P0 → remisión a la BITACORA y a `INFORME-PROMPT-1` §T4; R3 (verificación y diagnóstico); R5 (`periodo_id`, `obtenerCalendarioDePeriodo`, pendiente `fk-calendario-periodo`); punto 4 del checklist; fuera «Deuda…» y «Consolidación…» | C1 |
| `docs/normativo/GLOSARIO.md` | Sin `"AGO2026-ENE2027"`; «Trampa activa» nueva; «tablas físicas legado»; fila «Calificaciones (modelo B)» y fuera el blockquote; la CLAVE remite al pendiente | C2 |
| `docs/normativo/CONTRATO-DE-CAMBIO.md` | §1.5 = `test:ci` + suite (sigue en 12 líneas); §2: una casilla `test:ci`, identidad de calificaciones, archivo del informe, `gen:matriz`/`gen-rumbo`, INVARIANTES; §3: la CLAVE remite al pendiente | C3 |
| `AGENTS.md` | Sin «~37 KB», «~500 KB» ni «~800 KB»; migraciones (CONTRATO §1.3); «Al terminar: `npm run test:ci`»; nivel 3 = DECISIÓN 10; `diag-peso-cambio` y ORDEN §6; fila de Cline; párrafo de «aflojar» | C4 |
| `docs/00-INDICE.md` | Sin «~500 KB» ni «~37 KB»; 6 filas del presupuesto; sin «138» ni «(6 roles)»; `docs/historial/` en una frase; fila `supabase/*.sql`; filas `pendientes.json` y `TOKENS-OCEANO.css` | C5 |
| `README.md` | Roles → `ROLES_PORTAL`; `test:suites` sin cifra; fila `test:ci` | C6 |
| `ESTADO-ACTUAL.md` · `scripts/verificar-estado-actual.mjs` | Fuera la cabecera «HEAD:»; SQL pendiente de la portada; identidad de materia = modelo B; deuda 3 «en retirada»; §8 remite a AGENTS. El verificador cuenta los commits desde la última edición (`git log -1` + `rev-list --count`), con la misma tolerancia y las mismas claves `--json` | C7 |
| `scripts/README.md` | Fila de `verificar-estado-actual.mjs` alineada con C7 | C7 (implementador) |
| `docs/normativo/ORDEN.md` | «otro rol» y «se añadió `tecnico`»; fuera la fila `_borrador/`; `lib/escolar/` y `*-puro` en la tabla de imports; familias `administracion/` y `portada/`; prefijos de §4 con contrato o «se trata como `ESCRIBE`»; líneas normativas C8, C9, C16, C17 y la cuarentena; excepción de C14; §6 con los 11 puntos; «Un prompt, un dominio…»; «(lo archiva Claude)» | C8 |
| `filosofia.estructural` · `docs/normativo/INVARIANTES.md` | Rutas con raíz y backticks en las líneas citadas; «Patrón actual» en un párrafo; §4 con `periodo_id`, `PROFESORES.ID` y `calificaciones`; §15; la línea `INVARIANTE:` termina en «…no la filosofía.»; línea de cabecera sobre `gen:invariantes`. INVARIANTES, regenerado | C9 |
| `criterios.prompts` | §4 «QUÉ RECIBE CLINE»; frase en §7; §12, §13, §19 y §24 → remisiones; §26 + «Medición antes/después»; «cuatro»; ruta de informes | C10 |
| `scripts/gen-rumbo.mjs` · `RUMBO.md` | Línea fija dentro del bloque (`LINEA_FIJA`, y `--check` la exige); sufijo `· persona`/`· agente`; reglas con su texto de `test-orden --json`. RUMBO regenerado | C11 |
| `scripts/gen-contexto.mjs` | Fuera «Además, siempre: …»; texto de «aflojar» en las ramas cline y claude; cabecera sin «~500 KB» | C12 |
| `.github/workflows/verificacion.yml` | El comentario de `fetch-depth: 0` describe el mecanismo nuevo; el paso pasa a «ESTADO-ACTUAL.md al día (commits desde su última edición + nº de suites)». Solo texto: C17 compara los `run:` | Issue 1 (cierre) |
| `scripts/gen-estado.mjs` | Señal `docs.frescura`: título «commits desde su última edición» y detalle «última edición `<sha7>`, HEAD `<sha>`». Las claves del JSON no cambian | Issue 2 (cierre) |
| `docs/historial/README.md` | Filas `contexto.feliz.md` y `BITACORA-2026-09.md` en «Contenido», al que ahora remite el 00-INDICE | Issue 3 (cierre) |
| `criterios.prompts` | §26 «Validación»: «Tests, TypeScript y ESLint» → «`npm run test:ci` y la suite del módulo» | Issue 4, forma mínima (cierre) |
| `scripts/README.md` | «`probe-*` (los 16 que quedan aquí)» → «(los que no tienen fila propia)»: hoy son 17 | Pendiente que la Parte B dejó a C (cierre) |
| `docs/historial/informes/INFORME-PROMPT-V.md` | Esta sección | Cierre |

Diff de la parte sin contar los CR ni este informe: 22 archivos, +324/−364.

### 2. Quién lo ejecutó y qué pudo / no pudo hacer

| Agente | Rol | Pudo | No pudo y por qué |
|---|---|---|---|
| Claude (Opus 5.5), implementador | Hacer el pre-paso y C0-C12 en lugar de Cline, sin commit | Leer `docs/historial/` y el código para escribir R5 y el checklist (`calendario.ts:449`, `ciclo-estado.ts:289`); copiar el P0 y compararlo con diff; medir antes y después; regenerar RUMBO e INVARIANTES; `test:ci` dos veces | Confirmar en la base las 4 inscripciones de 2DO A RH, o que el SQL de `portada_carreras` sigue sin aplicar. Ejecutar `diag-calendario-periodo.mjs` (conecta a Supabase) y `gen-estado.mjs` (escribe `.panel/`). Dejar RUMBO y ESTADO exactos antes del commit |
| Claude, auditor independiente | Revisar contra CONTRATO §2/§3, las REGLAS de C y la filosofía | Recalcular la base desde HEAD (blobs sin CR / 4 = 10 347); comparar la copia del P0 con diff; repetir la VALIDACIÓN barata, `test-orden`, los tres `--check` y eslint de los 4 scripts; probar `gen-contexto`; comprobar los 7 ajenos | Corregir: solo propone (4 issues bajos). `test:ci` completo: se apoyó en el log del implementador |
| Claude, cierre | Aplicar la auditoría, re-validar, informe y commit | Issues 1-3 completos y el 4 en su forma mínima; la cifra falsa de `probe-*`; VALIDACIÓN completa y `test:ci`; commit con rutas concretas | Ejecutar `gen-estado.mjs` tras editarlo (escribe `.panel/`): validado con `node --check`, eslint y la plantilla evaluada aparte. Unificar §26 con ORDEN §6: C10 fijó su forma. Push: prohibido |

Ninguno de los tres tocó la base de datos, la red, `scripts/_peligrosos/`, `scripts/_archivo/`, `fase10-*`, ningún `.sql`, `lib/`, `app/` ni los 7 cambios ajenos del árbol.

### 3. Cómo se ejecutó y se midió

Orden del implementador: MEDICIÓN sobre `03eb384` → copia del P0 a la BITACORA (diff contra `b184b01`) → `pendientes.json` + `gen-rumbo` → poda de C1 → C0 y C2-C12 → `gen:invariantes` y `gen-rumbo` → VALIDACIÓN → `test:ci`. El cierre: issues → VALIDACIÓN → `test:ci` → informe → `test:ci` justo antes del commit.

| Medición | Antes (`03eb384` + ajenos) | Después (cierre) |
|---|---|---|
| `npm run verificar:docs` | exit 0 · **10 347** tokens · 0 rutas muertas | exit 0 · **9 720** tokens (−627) · 0 rutas muertas · techo 10 500 sin tocar |
| `git grep` de cifras de la VALIDACIÓN | **11**: AGENTS `:3`, `:14`, `:91`; README `:3`, `:26`; 00-INDICE `:4`, `:29`, `:71`; CONTRATO `:78`; GLOSARIO `:60`; ORDEN `:143` | **0** (exit 1) |
| `npm run verificar:estado` | OK, contra la cabecera «HEAD:» escrita a mano | OK · 144 líneas · 51 suites · aviso tolerado: 3 commits desde la última edición (`b184b01`); con este commit, 0 |
| `gen-invariantes --check` · `gen-rumbo --check` | al día | al día. Antes de regenerar, `gen-rumbo --check` daba DESFASADO, como se esperaba por el formato nuevo |
| `node scripts/test-orden.mjs` | 18 reglas · C10 19/19 · C11 21/21 | igual, también tras los cambios del cierre |
| `gen-contexto` | — | `--tareas` exit 0 (13 filas); `--tarea=inexistente` exit 1; el paquete lleva el punto 5 nuevo y el texto de «aflojar», sin «Además, siempre» |
| `npm run test:ci` | verde (cierre de B) | **verde, exit 0**: tsc; lint 0 errores y 1 aviso previo (`gen-panel.mjs:41` `MARCA`); 51/51 suites; test-permisos 738/0; auditoría de permisos 309/0; `--check` de matriz, invariantes y rumbo al día; `verificar:estado` OK; `verificar:docs` OK; build OK |

**Tokens del arranque**, por archivo (sin CR, la medida del CI):

| Archivo | Antes | Después | Delta |
|---|---|---|---|
| REGLAS_NO_HACER | 2 062 | 1 425 | −637 |
| ESTADO-ACTUAL | 2 000 | 1 947 | −53 |
| GLOSARIO | 1 996 | 1 938 | −58 |
| 00-INDICE | 1 829 | 1 830 | +1 |
| AGENTS | 1 302 | 1 358 | +56 |
| RUMBO | 537 | 601 | +64 |
| INVARIANTES | 476 | 476 | 0 |
| CLAUDE | 145 | 145 | 0 |
| **Total** | **10 347** | **9 720** | **−627** |

El OBJETIVO pedía coste neto ≤ 0, «en torno a 9 800». La base de esta parte es 10 347, no los 10 345 de A1, porque la Parte B regeneró RUMBO (+2). Los cambios del cierre no tocan ningún archivo del arranque.

### 4. Qué normas respetó

Del checklist del auditor; la columna «Cumple» es la suya, con lo que hizo el cierre donde cambió algo.

| Norma (CONTRATO §2 / §3) | Cumple | Evidencia |
|---|---|---|
| RESULTADO ESPERADO C0-C12 | sí | Diff de los 19 archivos revisado: los literales están donde el prompt pide; las 8 desviaciones, justificadas (§6) |
| Pre-paso: copia literal del P0 antes de podar | sí | diff de `b184b01:13-36 + 186-214` (sin CR) contra la BITACORA: idéntica. El encabezado contiene la cadena que cita REGLAS |
| §2 Alcance: solo lo pedido, extras justificados | sí | Extras: fila de `scripts/README.md`, BITACORA (pre-paso), INVARIANTES y RUMBO (regenerados), línea de la rama claude de `gen-contexto`. Los del cierre son los issues de la auditoría y la cifra de `probe-*` que B dejó a C |
| §2 Alcance: legacy en pie (R8) | sí | Sin código tocado; R5 nombra como excepción el fallback de `obtenerCalendarioDePeriodo` y la UNIQUE de texto; las excepciones `_borrador` de `verificar-docs` siguen porque otros docs las citan |
| §2 Alcance: sin fuente paralela (R6) | sí | La deuda 3 va a `pendientes.json`; ni documentos ni secciones nuevas salvo las pedidas (§26 y la BITACORA) |
| §2 Capas · Datos | n/a | Sin `app/`, `lib/`, `.sql` ni escritura en la base |
| §2 Identidad (periodos.id, PROFESORES.ID, `grupo_materia_id`, `periodo_id`) | sí | R5, checklist, GLOSARIO, CONTRATO §2, ESTADO §2 y filosofía §4 lo dicen así |
| §2 Verificación: `test:ci` en verde | sí | Implementador (dos veces) y cierre (tras los issues y antes del commit) |
| §2 Verificación: medición antes/después con el mismo script | sí | Sección 3; la base, recalculada por el auditor desde HEAD |
| §2 Verificación: nada de `_peligrosos/` ni `_archivo/` | sí | Solo los scripts permitidos; los que conectan a Supabase o escriben `.panel/` se declaran no ejecutados |
| §2 Documentación: ESTADO-ACTUAL si cambió una regla estructural | sí | Modelo B, deuda 3 en retirada, SQL de la portada; 144 líneas (≤ 150) |
| §2 Documentación: MAPA §2 si se movió una deuda | n/a | El prompt deja `MAPA:118` para D1: divergencia transitoria y prevista |
| §2 Documentación: `gen:matriz` / `gen-rumbo` en el mismo paso; INVARIANTES | sí | `pendientes.json` → RUMBO regenerado; ninguna Server Action cambiada; INVARIANTES solo regenerado; los tres `--check` al día |
| §3 Motivos de rechazo | sí | Ninguno: REGLAS cita la BITACORA como relato; 00-INDICE marca OPTIMIZACION como «línea base histórica» |
| `TECHO_TOKENS` y umbrales de `test-orden` | sí | `TECHO_TOKENS = 10500` igual; `test-orden.mjs` sin diff |
| Cifras derivables (DECISIÓN «Cifras») | sí | grep en 0; también «(6 roles)», «1 928 líneas» y, en el cierre, «16» de `probe-*`. Quedan cifras hoy ciertas que la parte no nombra (§7) |
| `verificar-estado-actual`: tolerancia y claves `--json` | sí | `headDeclarado` = sha de la última edición; `commitsAtras` = 3; aviso por encima de 1, fallo por encima de 10; sin sha, fallo explícito |
| Ajenos intactos, `git add` con rutas concretas | sí | Diff vacío de los 7 con `-w --ignore-cr-at-eol --ignore-blank-lines` |
| Finales de línea | sí | Cada archivo conserva los suyos (CRLF o LF); RUMBO e INVARIANTES, en LF por su generador; `git diff --check` limpio en los del cierre |

### 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto | Nota |
|---|---|---|
| R6 / §15 · fuente única | respeta | La deuda viva va a `pendientes.json` y el relato a la BITACORA; las cifras remiten a su fuente (`ROLES_PORTAL`, `scripts/test-*.mjs`, MATRIZ §5, el pendiente de claves, `verificar:docs`); criterios §12, §13, §19 y §24 pasan a remisiones. Queda §26 de criterios como segundo esquema de informe (para D) |
| §16 · medir antes y después | respeta | Mismos comandos antes y después: 10 347 → 9 720 tokens y 11 → 0 cifras |
| R8 · legacy no se retira | respeta | Sin código tocado; el fallback y la UNIQUE de texto quedan nombrados como excepción |
| Reutilizar antes de crear | respeta | `pendientes.json`, la BITACORA, el verificador reorientado y `LINEA_FIJA` dentro de `gen-rumbo`; ningún documento nuevo |
| No aflojar umbrales ni `TECHO_TOKENS` | respeta | `test-orden` sin diff; el texto de «aflojar» llega a AGENTS y a `gen-contexto` |
| Economía del arranque | respeta | −627 tokens: REGLAS (−637) paga AGENTS (+56) y RUMBO (+64) |
| ORDEN · dónde va cada cosa | respeta | Pendiente en `docs/sistema/`, relato en `docs/historial/`, reglas en su sección de ORDEN; las familias nuevas coinciden con el disco |
| Generados no se editan a mano | respeta | INVARIANTES y RUMBO salen de su generador; `gen-rumbo --check` detecta ahora que se borre la línea fija |
| Lo que el CI comprueba lo dicen sus textos | respeta | El cierre alineó con C7 el comentario y el paso del workflow y la señal del panel |

**Veredicto global:** la Parte C sigue la filosofía y la arquitectura del repo: el arranque es más corto, ya no copia cifras derivables y dice una sola verdad sobre calificaciones (modelo B), calendario (`periodo_id`), validación (`test:ci`) y autoridad (DECISIÓN 10).

### 6. Desviaciones y decisiones propias

**Desviaciones del implementador**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| C5 · fila de MATRIZ-PERMISOS | Además de «138», quitó «(6 roles)» | Cifra de roles a mano en la misma fila; la DECISIÓN «Cifras» manda `ROLES_PORTAL` |
| C7 · «Última revisión» de ESTADO | 2026-10-04 (PROMPT V, Parte C) | La regla del archivo: se actualiza en el cambio que lo vuelve falso |
| C7 · `scripts/README.md` | La fila del verificador describe el check nuevo | Si no, describiría uno que ya no existe |
| C10 · título de §4 | «CLINE YA CONOCE EL PROYECTO» → «QUÉ RECIBE CLINE» | El cuerpo nuevo dice que no conserva conocimiento |
| C11 · `gen-rumbo --check` | DESFASADO también si falta la línea fija (`faltaLineaFija`) | No depende de git; sin esto, borrarla a mano pasaba el CI |
| C12 · rama claude y cabecera de `gen-contexto` | Texto de «aflojar» y sin «~500 KB» | Citaba a AGENTS por un texto que C4 quitó, y decía «bajar», la dirección opuesta |
| C9 · cabecera de filosofía | La línea de `INVARIANTE:` en dos renglones | En uno rompe la caja de 80 columnas |
| C8 · fila de la raíz en ORDEN | Módulos sin `.ts` | Estilo del resto de la fila |

**Desviaciones y decisiones del cierre**

| Ítem | Qué cambió | Por qué |
|---|---|---|
| Issue 3, `docs/historial/README.md` | Aplicado ya, no «después de D» | El hueco lo abre C5 en este mismo commit (el 00-INDICE remite a ese README) y cuesta 0 tokens de arranque. La tarea de `:28` (OPTIMIZACION) sigue siendo de después de D |
| Issue 4, `criterios.prompts` §26 | Solo la forma mínima: «Validación» = `test:ci` + suite | «Tests, TypeScript y ESLint» contradecía CONTRATO §1.5 y la DECISIÓN «Validación». Convertir §26 en remisión a ORDEN §6 desharía la lista que C10 fijó: queda para D |
| Issue 2, `gen-estado.mjs` | Aplicado (opcional, trivial) | El panel mostraba «declara `<sha de 40>`», que ya no es lo que mide |
| `scripts/README.md` · `probe-*` | «(los 16 que quedan aquí)» → «(los que no tienen fila propia)» | Era falsa (hoy 17) y el informe de la Parte B la dejó a C. Las otras cifras a mano que quedan son ciertas hoy: van a D (§7) |

**Decisiones propias del implementador**
- BITACORA: la sección va al final, con una línea de origen (`b184b01`, líneas, C1) y las dos copias separadas por una línea en blanco, en CRLF como el archivo.
- REGLAS: el texto nuevo de la cabecera va como párrafo, no como blockquote; R1 queda sin el `---` delante, porque `:8-38` lo incluía.
- GLOSARIO: la fila del modelo B va al final de la tabla Materia; la «Trampa activa» conserva su arranque.
- AGENTS, nivel 3: REGLAS, el resto de `docs/normativo/` y `criterios.prompts`; en la forma de trabajo mandan ORDEN y CONTRATO, en los principios `filosofia.estructural`.
- 00-INDICE: la fila de rendimiento pierde también «(1 928 líneas…)».
- `verificar-estado-actual`: `headDeclarado` guarda el `%H` completo; si git no da el sha, es fallo; lo no committeado no cuenta.
- ORDEN: C9 en §1, C8 en §2, C18 y C17 en §4, C16 en §5, la excepción de C14 en su blockquote. Contratos de los prefijos según el README de B, y fila nueva «cualquier otro prefijo» = `ESCRIBE`. §6 con los 11 puntos; el 10 enumera las 7 secciones del informe.
- filosofía: se conserva la etiqueta «Patrón actual del proyecto (debe mantenerse):» y se cambia solo su cuerpo.
- criterios: §19 conserva «si una validación falla, corregirla», que no está en el CONTRATO; §26 gana «### Medición antes/después».
- gen-rumbo: `LINEA_FIJA` es una constante; `/^persona/i` también casa «persona - …».

### 7. Lo no verificado y lo pendiente

| Qué | Estado | Por qué / quién |
|---|---|---|
| Las 4 inscripciones activas en 2DO A RH | no verificado | Sin base; el pendiente queda con `revisado` 2026-09-03 y `verificar: null` |
| Que el SQL de `portada_carreras` siga sin aplicar | no verificado | Sin base; ESTADO remite al pendiente `sql-portada-carreras` |
| `diag-calendario-periodo.mjs`, que cita la R3 nueva | no ejecutado | Conecta a Supabase. Que `validarIntegridadCiclo` cuente por `periodo_id` se comprobó leyendo el código |
| `gen-estado.mjs` con el verificador nuevo y el texto del cierre | no ejecutado | Escribe `.panel/`. Comprobado leyendo `:207-213`, con la salida `--json` del verificador, `node --check`, eslint y la plantilla evaluada aparte |
| RUMBO tras el commit | a vigilar | Dirá `main · 03eb384`, 1 commit por detrás (tolerado hasta 10); ESTADO quedará en 0 |
| `MAPA-DEL-SISTEMA` §2a sin «deuda 3 en retirada» | pendiente | D1, como prevé el prompt |
| `criterios.prompts` §26 como remisión a ORDEN §6 punto 10 | pendiente | D o una nota (issue 4) |
| Cifras a mano que la parte no nombra y hoy son ciertas: «16 principios» (AGENTS `:8`, 00-INDICE), «21 copias sobrantes» (ORDEN `:93`, fila de `test-orden` en `scripts/README.md`) | pendiente | La de C11 se deriva de `test-orden`: candidatas para D. Las «81 filas» del GLOSARIO son un hecho histórico fijo |
| Rutas sin raíz de `filosofia.estructural` fuera de las líneas citadas (§12, cabecera) | pendiente | D4(d) |
| `docs/historial/README.md:28`: «las mediciones son anteriores al refactor» | pendiente | Claude, después de D (PARA CLAUDE) |
| Aviso de lint en `gen-panel.mjs:41` (`MARCA`) | previo | Ajeno a la Parte C |
