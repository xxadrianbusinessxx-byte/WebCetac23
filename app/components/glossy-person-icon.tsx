import type { GeneroUsuario } from "@/lib/chat/types";

const PALETAS: Record<
  GeneroUsuario,
  { stops: [string, string, string]; shine: string }
> = {
  masculino: {
    stops: ["#7dd3fc", "#38bdf8", "#0369a1"],
    shine: "#ffffff",
  },
  femenino: {
    stops: ["#f9a8d4", "#ec4899", "#be185d"],
    shine: "#ffffff",
  },
};

export function GlossyPersonIcon({
  className = "",
  uid,
  genero = "masculino",
}: {
  className?: string;
  uid: string;
  genero?: GeneroUsuario;
}) {
  const b = `gp-body-${uid}`;
  const s = `gp-shine-${uid}`;
  const [c0, c1, c2] = PALETAS[genero].stops;

  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id={b} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor={c0} />
          <stop offset="45%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        <radialGradient id={s} cx="35%" cy="25%" r="55%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="24" cy="38" rx="16" ry="10" fill={`url(#${b})`} />
      <circle cx="24" cy="16" r="9" fill={`url(#${b})`} />
      <ellipse cx="24" cy="28" rx="11" ry="9" fill={`url(#${b})`} />
      <ellipse cx="24" cy="18" rx="7" ry="6" fill={`url(#${s})`} />
    </svg>
  );
}
