# INFORME — PROMPT AB: Administración ve a los alumnos pendientes de grupo

2026-10-29. Prompt: `docs/historial/prompts/PROMPT_AB_ALUMNOS_PENDIENTES_DE_GRUPO.md`.

Contexto: ese mismo día, con autorización del usuario en el chat, se aplicó en
producción la depuración del roster de semestres 1/3/5. Se dieron de alta 9
alumnos en `ALUMNOS` **sin inscripción**, se pusieron 11 etiquetas
«Pendiente de administración» y se corrigieron nombres y una CURP según el
Excel. Ese cambio de datos no está en el repo porque lleva CURP y nombres. Lo
que sigue es solo el código que hace visibles esas marcas.

## 1. Qué se hizo

| Archivo | Cambio |
|---|---|
| `lib/escolar/alumno/datos-incompletos-puro.ts` | Nuevo campo primordial `grupo` («Grupo, grado y carrera»). También `TITULO_ETIQUETA_PENDIENTE`, `esEtiquetaPendiente`, `notasDePendientes`, `curpsARevisar` y `debeListarse`. `AlumnoIncompleto.nota` y `resumen.porConfirmar` son nuevos. El mensaje ahora menciona a los «por confirmar». |
| `lib/escolar/alumno/datos-incompletos.ts` | Una lectura más (`alumno_etiquetas` filtrado por título con `ilike`). Revisa la unión del roster y los marcados. `tieneGrupo` se calcula por `periodos.id`. |
| `app/components/datos-incompletos-panel.tsx` | Modo «Grupo», chip «Por confirmar», la nota debajo del nombre y un texto que explica quién cierra cada pendiente. |
| `lib/navegacion/mapa-navegacion.ts` | Se agrega el modo «Grupo» a Notificaciones › Datos incompletos. Quedó fuera del paquete, pero sin él no se puede filtrar desde el mapa. |
| `scripts/test-datos-incompletos.mjs` | De 22 a 42 verificaciones (sección PROMPT AB). |
| `scripts/test-rediseno-oceano.mjs` | La lista de modos esperada suma «Grupo». Cambió la especificación; el invariante no se aflojó. |
| `scripts/diag-pendientes-administracion.mjs` + fila en `scripts/README.md` | Diag nuevo, `LEE(red)`. Imprime solo conteos. |

## 2. Quién lo ejecutó y qué pudo / no pudo hacer

Un solo agente (Claude) implementó y se auditó a sí mismo. El usuario pidió
«ejecútalo tú» en lugar de pasárselo a Cline, así que no hubo auditor
independiente. Claude no pudo entrar con una sesión de Administración, porque
solo hay cuentas reales.

## 3. Cómo se ejecutó y midió

| Medida | Antes | Después |
|---|---|---|
| Revisados por el panel | 357 | 367 |
| Sin número de control | 14 | 24 |
| Sin grupo, grado y carrera | — | 10 |
| Por confirmar | — | 1 |
| CURP / nombre incompletos | 0 / 0 | 0 / 0 |
| `test-datos-incompletos` | 22/22 | 42/42 |

El «antes» se midió con SQL de solo lectura y el «después» con
`node scripts/diag-pendientes-administracion.mjs`. Además se ejecutó la función
real `leerDatosIncompletosDelCiclo` contra la base, con
`node --conditions=react-server` y sin escribir: dio el mismo resumen.

`npm run test:ci`: tsc ✅ · lint ✅ (2 avisos ya existentes) · suites 62/63. La
roja es `test-auditoria-ciclo-f1` y **ya fallaba en `main` sin este cambio**
(se comprobó con `git stash`). Como esa roja corta la cadena, los pasos
siguientes se corrieron a mano: test:permisos 865/865 · gen-matriz --check ·
gen-invariantes --check · gen-rumbo --check · verificar:estado ·
verificar:docs · build ✅.

## 4. Normas respetadas (CONTRATO §2)

| Regla | Cumple |
|---|---|
| La decisión vive en el puro, con suite | ✅ La unión, el conteo, la marca y el criterio para listar están en el puro. |
| La action solo valida y delega | ✅ `actionDatosIncompletosDelCiclo` no cambió. |
| Cambio aditivo | ✅ Las filas del roster sin el campo nuevo conservan su resultado (está probado). |
| Sin camino paralelo | ✅ El grupo se sigue leyendo de `inscripciones_alumno` y el ciclo de `periodos.id`. La marca reutiliza `alumno_etiquetas`; no hay tabla nueva. |
| Script de solo lectura | ✅ El diag solo hace GET. |
| Un solo literal | ✅ El título vive en `TITULO_ETIQUETA_PENDIENTE`. |

## 5. ¿Sigue la filosofía y la arquitectura?

| Principio | Veredicto |
|---|---|
| Fuente única alumno→grupo | Sí. La marca no guarda el grupo, solo dice que falta. |
| Capas (puro / dominio / cliente) | Sí. `test-orden` está en verde. |
| Etiquetas dinámicas ≠ campos estructurados (filosofía §6) | Hay tensión. Una etiqueta de usuario funciona aquí como señal del sistema. Lo eligió el usuario, y el riesgo queda acotado: si alguien renombra la etiqueta, el alumno sale del aviso, pero no se pierde nada. Si las marcas se vuelven habituales, conviene una columna o tabla de «alta pendiente». |

Veredicto: aceptable, con esa tensión anotada.

## 6. Desviaciones y decisiones propias

- Toqué `mapa-navegacion.ts` y `test-rediseno-oceano.mjs`, que estaban fuera del paquete, para el modo «Grupo».
- `incompletos` cuenta solo a quien le falta algo. Los marcados completos van aparte, en `porConfirmar`. Así la cifra de siempre conserva su significado.
- El `ilike` usa un patrón holgado (`%pendiente%de%administración%`) y la decisión final la toma el puro.

## 7. Lo no verificado / pendiente

- **La vista con sesión real de Administración.** No se vio el panel pintado con datos.
- `test-auditoria-ciclo-f1` ya estaba roja en `main` y sigue así. Hay que investigarla aparte.
- Cerrar los 11 pendientes: el Técnico inscribe, Administración captura el número de control y quita la etiqueta.
- Quedan 2 alumnos en `ALUMNOS` con la «Ñ» rota, que no venían en el Excel.
