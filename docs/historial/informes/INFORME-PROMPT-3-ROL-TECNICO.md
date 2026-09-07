# INFORME — PROMPT-3: Rol técnico

- **Fecha de ejecución:** 2026-09-06
- **Prompt:** `docs/historial/prompts/PROMPT-3-ROL-TECNICO.md`
- **Estado:** ejecutado T1–T5.
- **Primer prompt que cambia comportamiento.** Los prompts 1 y 2 no movieron un
  permiso; este creó el rol técnico (T1), la UI por `puede()` (T2), la consola
  de asignaciones en volumen (T3), las credenciales de acceso (T4) y aplicó el
  recorte a directivo de la §4 (T5).

---

## 1. Medición previa (§4 del prompt) — pegada

```
node scripts/test-permisos.mjs             → 155 pasadas, 0 fallidas (4 roles)
node scripts/test-auditoria-permisos.mjs   → 137 actions, 217 pasadas, 0 fallidas
node scripts/gen-matriz-permisos.mjs --check → "Al día."
node scripts/p0-diag-contexto.mjs          → asignacionesActivas=0 en el operativo
node scripts/diag-profesor-alcance.mjs     → 20 profesores · 3 claves · 81 clases históricas

Roles: 4 · capacidades 62 · actions 137
Capacidades por rol: directivo ~61 · maestro 25 · tutor 13 · alumno 9
PROFESORES: 20 filas (0 con Permisos='Tecnico')
asignaciones_profesor: 0 filas activas
```

## 2. Medición posterior (contrato §7.6)

```
node scripts/test-permisos.mjs             → 461 pasadas, 0 fallidas (5 roles, código ⇄ §4)
node scripts/test-auditoria-permisos.mjs   → 138 actions, 218 pasadas, 0 fallidas
node scripts/gen-matriz-permisos.mjs --check → "Al día."
npx tsc --noEmit                           → 0 errores
Las 32 suites                              → 0 fallos
next build                                 → 9 rutas

Roles: 5 · capacidades 62 · actions 138
Capacidades por rol: directivo 32 · tecnico 44 · maestro 24 · tutor 12 · alumno 8
  (sin contar portada.ver, pública)
PROFESORES: 21 filas (1 con Permisos='Tecnico': ID 21 "TECNICO",
  debe_cambiar_credenciales=true)
asignaciones_profesor: 0 activas en la BD consultada (la consola de volumen
  quedó lista; el poblar la atribución es tarea operativa del técnico — A2)
```

## 3. La decisión del recorte (T5) — el delta con la §4 redactada

El prompt T5 decía «aplicar la §4 completa»; la §4 congelada en el PROMPT-2
dibujaba cambios de M/T/A que el PROMPT-3 no autoriza (solo describe el recorte
de **directivo**). Consulta al directivo → **decisión registrada**: maestro/
tutor/alumno quedan HOY; directivo se recorta; el rol técnico entra con la
columna Tec de §4. El documento `MATRIZ-PERMISOS.md` §4 se regeneró desde el
código (`node scripts/gen-seccion4.mjs`) para que la tabla SIEMPRE coincida con
`permisos.ts`, y la sección «Código ⇄ §4 (los 5 roles)» de `test-permisos.mjs`
lo verifica.

Filas donde la §4 redactada difería de HOY en M/T/A y **no** se aplicaron
(delta documentado):

| Capacidad | §4 redactada (no aplicada) | Resultado (HOY) |
|---|---|---|
| `evaluacion.ver` | M ✅ | M X |
| `justificacion.resolver` | M ✅ | M X |
| `justificacion.solicitar` | M X | M ✅ (HOY) |
| `horario.ver_alumno` | T/A X | T/A ✅ (HOY) |
| `alumno.editar_datos_personales` | T X / A ✅ | T ✅ (HOY) / A X |
| `alumno.editar_etiquetas` | T X / A ✅ | T ✅ (HOY) / A X |
| `alumno.editar_estatus` | M ✅ | M X |
| `profesor.cambiar_clave_propia` | T/A ✅ | T/A X |
| `tutor.cambiar_credenciales_propias` | M/A ✅ | M/A X |
| `ciclo.ver` | solo Tec | D X, M/T/A ✅ (listado HOY) |

## 4. Archivos tocados y por qué

| Archivo | Qué cambió |
|---|---|
| `lib/auth/types.ts` | `"tecnico"` añadido al union `PortalRole`. |
| `lib/auth/session.ts` | `decodePortalSession` acepta el rol `tecnico` (requisito funcional del login del técnico; ampliación mínima de infraestructura, no gobernanza por rol). |
| `lib/escolar/catalogo/profesores.ts` | `rolDesdePermisos()` reconoce `Permisos='Tecnico'`. |
| `lib/auth/permisos.ts` | Fila `tecnico` (T1, columna Tec de §4) + **recorte de `directivo`** (T5: pierde configuración, conserva lectura y operación diaria). |
| `app/actions/login.ts` | `destinationForRole` → técnico aterriza en `/configuracion`. |
| `app/actions/profesores.ts` | `actionReponerClaveAccesoProfesor` (T4.2) con frontera: el técnico solo repone claves de cuentas de rol maestro. |
| `app/actions/escolar.ts` | Cast del rol para la vista de calificaciones (el técnico no llega: `calificacion.ver` lo niega). |
| `app/components/cambio-clave-forzado.tsx` (nuevo) | Formulario de cambio forzado (T4.1) + pantalla completa reutilizable. |
| `app/configuracion/page.tsx` | Acceso por `puede(ciclo.crear || asignacion.ver)`; bloqueo de clave forzada antes de montar la consola; panel de credenciales para el técnico (`ocultarId`). |
| `app/components/asignaciones-admin.tsx` | UI de volumen (T3): buscador por profesor, selector de grupo, buscador de materia y **alta en lote por grupo**. Sin reescribir las actions. |
| `app/components/profesores-credenciales-panel.tsx` | Botón «Reponer clave» + `ocultarId` (el técnico no ve `PROFESORES.ID`). |
| `app/components/ui/barra-navegacion.tsx` | Hogar del técnico (Técnico → `/configuracion`) + enlaces transversales por `puede()`. |
| `app/layout.tsx` | `tieneDocumentos` gobernado por `puede()`/`esRol()` (maestro consulta su acceso). |
| `app/documentos/page.tsx`, `app/documentos/documentos-client.tsx`, `app/tutor/page.tsx` | Acceso por capacidad. |
| `app/directivo/directivo-client.tsx` | Paneles que el directivo perdió (edición de catálogo, ETIQUETAS masivas, credenciales) se gobiernan con `puede()` (regla 4). |
| `scripts/migrar-crear-tecnico.mjs` (nuevo) | Crea la fila `TECNICO` (idempotente, `--apply` para escribir). |
| `scripts/probe-login-tecnico.mjs` (nuevo) | Prueba del login técnico (rol/ID/flag). |
| `scripts/test-permisos.mjs` | 5 roles; comparación código ⇄ §4 completa. |
| `scripts/gen-seccion4.mjs` (nuevo) | Regenera la tabla §4 del documento desde `permisos.ts`. |
| `docs/sistema/MATRIZ-PERMISOS.md`, `ESTADO-ACTUAL.md`, `docs/normativo/GLOSARIO.md`, `scripts/README.md` | Documentación. |

## 5. Lo que NO se toc� pudiendo hacerlo

- **`lib/auth/exigir.ts`, `capacidades.ts`** � sin cambios: el dise�o del PROMPT-2
  se reutiliz� tal cual para el rol nuevo.
- **Capas de alcance** (`acceso-alumno.ts`, `columnas-calificaciones.ts`,
  `demo-profiles.ts`): no se gobiernan por `puede()` (regla 5); `session.ts` solo
  ampli� el decode al rol nuevo (infraestructura de sesi�n).
- **Esquema de BD:** este prompt no llev� `.sql`; el �nico cambio de datos fue la
  fila t�cnica en `PROFESORES` (autorizada por el directivo).
- **Migraci�n masiva de claves** (A4): no se hizo; cada profesor cambia la suya al
  entrar. Las 81 filas hist�ricas con clave `4321` siguen con autor�a irrecuperable.
- **CicloConfigurador y dem�s UI de configuraci�n** que el t�cnico hereda de
  `/configuracion`: no se reescribieron (quedan fuera del alcance).

## 6. Prueba de humo rol por rol (criterio �9.6)

Verificado por `test-permisos.mjs` (c�digo ? �4, 5 roles):

| Rol | Puede | No puede |
|---|---|---|
| t�cnico | `ciclo.crear`, `alumno.cargar_roster`, `asignacion.editar`, `materia.editar_alias`, `tutor.crear`, `profesor.ver_credenciales_acceso` | `calificacion.ver`, `asistencia.subir`, `justificacion.ver_todas` |
| directivo | `justificacion.ver_todas`, `asistencia.ver_grupo`, `calificacion.ver`, `documento.ver`, `materia.ver_catalogo`, `ciclo.ver_operativo` | `ciclo.crear`, `asignacion.ver`, `tutor.crear`, `horario.importar` |
| maestro | `asistencia.subir`, `materia.mapear_columnas`, `materia.ver_catalogo`, `ciclo.ver_operativo` | `ciclo.crear`, `tutor.crear` |
| tutor | `tutor.ver_propio`, `justificacion.solicitar`, `asistencia.ver_alumno`, `tutor.cambiar_credenciales_propias` | `asistencia.subir`, `calificacion.subir` |
| alumno | `alumno.ver_perfil`, `calificacion.ver`, `asistencia.ver_alumno`, `justificacion.solicitar` | `asistencia.subir`, `calificacion.subir` |

Verificaci�n de login real del t�cnico (BD): `scripts/probe-login-tecnico.mjs`
? rol `tecnico`, `profesorId=21`, `debe_cambiar_credenciales=true`.

## 7. Pendiente (no es del prompt, queda registrado)

1. **Commitear** PROMPT-1/2/3 (todo en el working tree).
2. **Poblar `asignaciones_profesor`** desde la consola del t�cnico para que
   `p0-diag-contexto.mjs` muestre `asignacionesActivas > 0` (A2) y para que la
   atribuci�n de asistencia tenga de d�nde resolver.
3. Pendientes previos de PROMPT-1 (68 filas de asistencia hist�ricas, CLAVEs
   duplicadas de profesores).
4. **Prompts 4 y 5** cuando el usuario lo indique.
