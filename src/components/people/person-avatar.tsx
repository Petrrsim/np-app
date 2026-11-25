import type { LinkTone } from "@/types/db";
import { cn } from "@/lib/utils";
import { TONES, initials } from "@/lib/people";

/** Ring (outside a thin white gap) in your-energy colour; energizing also glows softly. */
function vibeRing(vibe: LinkTone | null | undefined, size: number): string | undefined {
  if (vibe === null || vibe === undefined) return undefined;
  const w = size >= 48 ? 3 : 2;
  const c = TONES[vibe].color;
  const ring = `0 0 0 2px var(--card, #fff), 0 0 0 ${2 + w}px ${c}`;
  return vibe === 1 ? `${ring}, 0 0 ${size / 3}px 1px color-mix(in srgb, ${c} 45%, transparent)` : ring;
}

/**
 * Initials in a soft disc tinted with the person's first group colour (`color`, a hex), or
 * neutral ink when they're in no group. Hidden people get a dashed border. `vibe` adds a ring in
 * the colour of your energy with them (as on the web).
 */
export function PersonAvatar({
  name,
  color,
  size = 36,
  hidden = false,
  vibe,
  className,
}: {
  name: string;
  color: string | null;
  size?: number;
  hidden?: boolean;
  vibe?: LinkTone | null;
  className?: string;
}) {
  const boxShadow = vibeRing(vibe, size);
  const style = color
    ? {
        width: size,
        height: size,
        color,
        background: `linear-gradient(160deg, color-mix(in srgb, ${color} 18%, white), color-mix(in srgb, ${color} 7%, white))`,
        borderColor: `color-mix(in srgb, ${color} 35%, transparent)`,
        fontSize: size * 0.36,
        boxShadow,
      }
    : { width: size, height: size, fontSize: size * 0.36, boxShadow };
  return (
    <span
      aria-hidden
      style={style}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full border font-semibold tracking-tight",
        !color && "border-border bg-linear-to-b from-muted to-card text-foreground/75",
        hidden && "border-dashed opacity-70",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}
