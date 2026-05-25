/**
 * Peticiones al mismo origen (ruta relativa). Evita URLs absolutas de Vercel en el cliente.
 */

export class FetchAppError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "FetchAppError";
  }
}

function rutaRelativa(path: string): string {
  const p = path.trim();
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

export async function fetchAppJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(rutaRelativa(path), {
    ...init,
    method: init?.method ?? "GET",
    credentials: "same-origin",
    cache: init?.cache ?? "no-store",
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    let detalle = res.statusText;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) detalle = body.error;
    } catch {
      /* texto vacío */
    }
    throw new FetchAppError(detalle || `Error ${res.status}`, res.status);
  }

  return res.json() as Promise<T>;
}
