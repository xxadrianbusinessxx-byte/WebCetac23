export function GlossyPersonIcon({
  className = "",
  uid,
}: {
  className?: string;
  uid: string;
}) {
  const b = `gp-body-${uid}`;
  const s = `gp-shine-${uid}`;
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      <defs>
        <linearGradient id={b} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="45%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0369a1" />
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
