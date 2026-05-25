/** Fuerza HTTPS en URLs públicas (Cloudinary, etc.). */
export function asegurarHttps(url: string | null | undefined): string | null {
  if (!url?.trim()) return null;
  const t = url.trim();
  if (t.startsWith("//")) return `https:${t}`;
  if (t.startsWith("http://")) return `https://${t.slice(7)}`;
  return t;
}

export function asegurarHttpsEnUrlsNoticias<
  T extends Record<number | string, string | null>,
>(urls: T): T {
  const out = { ...urls };
  for (const k of Object.keys(out)) {
    const key = k as keyof T;
    out[key] = asegurarHttps(out[key] as string | null) as T[keyof T];
  }
  return out;
}
