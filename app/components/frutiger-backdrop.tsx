import type { ReactNode } from "react";

function WaterBubbles() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <div className="absolute -left-8 top-[12%] h-24 w-24 rounded-full bg-sky-200/40 blur-sm [animation:float-bubble_7s_ease-in-out_infinite]" />
      <div className="absolute right-[8%] top-[20%] h-16 w-16 rounded-full bg-white/50 blur-[2px] [animation:float-bubble-slow_9s_ease-in-out_infinite]" />
      <div className="absolute bottom-[28%] left-[18%] h-10 w-10 rounded-full border border-white/60 bg-sky-100/30 [animation:float-bubble_6s_ease-in-out_infinite_1s]" />
      <div className="absolute right-[22%] bottom-[35%] h-32 w-32 rounded-full bg-cyan-200/25 blur-md [animation:float-bubble-slow_11s_ease-in-out_infinite_2s]" />
      <div className="absolute bottom-6 left-6 h-20 w-20 rounded-full border border-white/50 bg-linear-to-br from-white/55 via-sky-200/35 to-sky-400/25 shadow-[inset_0_4px_12px_rgba(255,255,255,0.65),0_8px_24px_rgba(14,165,233,0.2)] [animation:float-bubble-slow_10s_ease-in-out_infinite]" />
    </div>
  );
}

function GrassFooter() {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-32 bg-linear-to-t from-emerald-200/25 via-emerald-100/12 to-transparent"
      aria-hidden
    >
      <div
        className="absolute inset-x-0 bottom-0 h-16 opacity-40"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -75deg,
            transparent,
            transparent 3px,
            rgba(52, 211, 153, 0.12) 3px,
            rgba(52, 211, 153, 0.12) 5px
          )`,
        }}
      />
    </div>
  );
}

const BG_STYLE = {
  backgroundImage: `
    radial-gradient(ellipse 140% 90% at 50% -15%, #7dd3fc 0%, #bae6fd 28%, #f0f9ff 55%, #ffffff 100%),
    radial-gradient(ellipse 80% 50% at 100% 0%, rgba(125, 211, 252, 0.35) 0%, transparent 55%),
    radial-gradient(ellipse 70% 45% at 0% 100%, rgba(224, 242, 254, 0.9) 0%, transparent 50%)
  `,
} as const;

export function FrutigerBackdrop({ children }: { children: ReactNode }) {
  return (
    <div className="relative isolate min-h-dvh overflow-x-hidden font-sans">
      <div className="fixed inset-0 -z-10 bg-white" style={BG_STYLE} />
      <WaterBubbles />
      <GrassFooter />
      {children}
    </div>
  );
}
