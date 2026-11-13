import type { PortalRole } from "../auth/types.ts";
import { apartadoInicial, esNavegable, pestana, pestanasDe } from "./mapa-navegacion.ts";

/**
 * seleccion-url.ts — la pestaña, el apartado y el modo del portal, leídos de la
 * dirección y escritos en ella. 2026-11-13.
 *
 * Existe para poder ENLAZAR una pantalla concreta del portal:
 * `/perfil?pestana=calendario&apartado=horario-escolar` abre el horario del
 * alumno, no la portada del rol. Sirve a la presentación de perfiles («Abrir en
 * vivo»), a los manuales y a cualquier enlace que se mande por mensaje.
 *
 * Puro: no lee `window` ni la base. Quién puede ver qué lo sigue decidiendo el
 * mapa (`mapa-navegacion.ts`) y el servidor; la dirección solo PROPONE, y lo
 * que el rol no tiene se ignora y cae al estado inicial de siempre. Un enlace de
 * profesor abierto por un alumno no le enseña nada nuevo: le abre su portada.
 */

/** Lo que el shell tiene seleccionado. `null` = no hay (la pestaña no tiene apartados navegables). */
export type Seleccion = {
  idPestana: string;
  idApartado: string | null;
  modo: string | null;
};

/** Los tres parámetros tal como llegan de la dirección (pueden faltar o venir mal). */
export type ParametrosSeleccion = {
  pestana?: string | null;
  apartado?: string | null;
  modo?: string | null;
};

const CLAVES = ["pestana", "apartado", "modo"] as const;

/**
 * La selección que pide la dirección, validada contra el mapa del rol. Cada
 * nivel que no exista (o no sea navegable) cae al inicial de su nivel:
 *   pestaña inválida  → primera pestaña del rol, su primer apartado y su primer modo;
 *   apartado inválido → primer apartado navegable de esa pestaña;
 *   modo inválido     → primer modo de ese apartado.
 * Sin parámetros devuelve exactamente lo que el shell abría antes de existir esto.
 */
export function seleccionDesdeParametros(
  rol: PortalRole | null,
  p: ParametrosSeleccion = {},
): Seleccion {
  const pedida = pestana(rol, String(p.pestana ?? "").trim());
  const laPestana = pedida ?? pestanasDe(rol)[0] ?? null;
  if (!laPestana) return { idPestana: "", idApartado: null, modo: null };

  const idApartadoPedido = pedida ? String(p.apartado ?? "").trim() : "";
  const pedido = laPestana.apartados.find((a) => a.id === idApartadoPedido) ?? null;
  const elApartado = pedido && esNavegable(pedido) ? pedido : apartadoInicial(rol, laPestana.id);

  const modoPedido = pedido && elApartado === pedido ? String(p.modo ?? "").trim() : "";
  const modos = elApartado?.modos ?? [];
  const elModo = modos.includes(modoPedido) ? modoPedido : (modos[0] ?? null);

  return { idPestana: laPestana.id, idApartado: elApartado?.id ?? null, modo: elModo };
}

/**
 * La parte de búsqueda de la dirección (sin «?») con la selección escrita.
 * Conserva cualquier otro parámetro que ya hubiera —`alumno`, sobre todo— y
 * quita `modo` cuando no hay. El orden de los demás no se toca.
 */
export function busquedaConSeleccion(busquedaActual: string, sel: Seleccion): string {
  const params = new URLSearchParams(busquedaActual.replace(/^\?/, ""));
  for (const clave of CLAVES) params.delete(clave);
  if (sel.idPestana) params.set("pestana", sel.idPestana);
  if (sel.idApartado) params.set("apartado", sel.idApartado);
  if (sel.modo) params.set("modo", sel.modo);
  return params.toString();
}

/** `/perfil` con la selección y el alumno elegido (si lo hay), lista para navegar o enlazar. */
export function rutaPerfil(sel: Seleccion, alumno?: string | null): string {
  const base = alumno ? `alumno=${encodeURIComponent(alumno)}` : "";
  const busqueda = busquedaConSeleccion(base, sel);
  return busqueda ? `/perfil?${busqueda}` : "/perfil";
}
