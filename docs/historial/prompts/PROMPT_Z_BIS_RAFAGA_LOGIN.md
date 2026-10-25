# PROMPT Z-bis — Que la ráfaga del login se degrade en vez de derrumbarse

> Redactado y ejecutado por Claude el 2026-10-25, a pedido del usuario: «Antes del commit, ataca la ráfaga
> del login: RPC de login y tope de peticiones simultáneas por instancia, y vuelve a medir los 500 en 10 s».
> Base: el PROMPT Z sin commit (`docs/historial/informes/INFORME-PROMPT-Z-CAPACIDAD-GRADUAL.md` §3d).

## OBJETIVO

Que 500 usuarios entrando en los mismos 10 s, con ≤ 1 s entre pantallas, **terminen sus sesiones** aunque
tarden más, en lugar de colapsar el sistema durante minutos. Sin cambiar de plan y sin cambiar quién entra.

## ESTADO ACTUAL (medido el 2026-10-25)

- Ráfaga de 500: 0/500 sesiones, todo cae en el login. Esa ráfaga pide ~850 peticiones/s, unas 3× lo que el
  plan gratuito sostuvo limpio (~290/s). Al pasarse no se ralentiza: se derrumba.
- El login hace hasta 5 peticiones en serie: PROFESORES, ALUMNOS (filtrado), tutores por usuario, tutores
  por clave y credenciales iniciales del tutor.
- RLS de esas tablas: trivial (`true`), no es la causa.

## DECISIONES TOMADAS

| # | Cambio | SQL |
|---|---|---|
| ZB1 | **RPC `candidatos_login(p_identificador, p_patron)`**: trae en UNA petición los candidatos con las mismas reglas que cada consulta (ILIKE con `\ % _` escapados y `*` como comodín; `clave_tutor` solo si hay exactamente uno; hashes del tutor elegido). Solo `service_role`. **No decide**: `validarAccesoPortal` compara exactamente igual, ahora a través de una `FuenteLogin` (RPC o consultas). Sin la RPC, las consultas de siempre, y se recuerda 60 s que no existe | **sí: lo aplica la persona** |
| ZB2 | **Tope de peticiones simultáneas a Supabase por instancia** (`lib/supabase/fetch-con-tope.ts`, 12 por defecto, `SUPABASE_MAX_PETICIONES_SIMULTANEAS`): cola en orden de llegada; quien espera más de 20 s (`SUPABASE_ESPERA_MAX_MS`) recibe un error inmediato. Va como `global.fetch` en los dos clientes y en la descarga del spec | no |
| ZB3 | El emparejamiento sale a funciones puras reutilizables (`elegirProfesorPorNombre`, `elegirAlumnoPorNombre`, `verificarContraseñaEntreHashes`): las dos fuentes deciden con el mismo código | no |

## MEDICIÓN

Antes: la ráfaga de §3d del informe del PROMPT Z. Después: la misma ráfaga y la escalera realista (250,
500, 800), para comprobar que el tope no empeora lo normal. Equivalencia: candidatos de la RPC frente a las
consultas, con todos los identificadores reales.

## REGLAS / SEGURIDAD

Quién entra no cambia: la comparación de nombres, claves y scrypt es la misma función. La RPC devuelve al
servidor lo mismo que ya leían las consultas (CLAVE, password_hash) y solo la ejecuta `service_role`.

## ALCANCE

SÍ: `supabase/crear-rpc-candidatos-login.sql`, `lib/auth/fuente-login.ts` (nuevo), `lib/auth/portal-login.ts`,
`lib/supabase/fetch-con-tope.ts` (nuevo), una línea en `lib/supabase/server.ts` y `service.ts`,
`lib/escolar/openapi.ts`, las funciones puras en `profesores.ts`, `alumnos.ts` y `tutores-credenciales.ts`, y
dos suites.
NO: RLS (lo hace otra sesión en paralelo: pendiente `rls-tablas-publicas`), el formulario de login y las cookies.

## CONTRATO

```
CONTRATO (obligatorio):
1. Antes de tocar nada: correr el diagnóstico de solo lectura que aplique
   (scripts/README.md, columna LEE) y pegar la medición inicial.
2. La decisión va en un módulo puro y probable sin base de datos. La action
   solo valida sesión y delega. La lógica no vive en app/actions/.
3. Cambio aditivo. Nada destructivo, nada de borrar legacy, ninguna migración
   de datos sin autorización explícita en este mismo prompt.
4. No crear un camino paralelo a una fuente única existente
   (periodos para ciclo, inscripciones_alumno para alumno→grupo).
5. Validar: npm run test:ci (el CI completo) + la suite del módulo.
6. Volver a correr el diagnóstico del paso 1 y mostrar antes/después.
7. Entregar: qué archivos tocaste, por qué, y qué NO tocaste pudiendo hacerlo.
```
