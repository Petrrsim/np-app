import { Activity, Drum, Dumbbell, Footprints, Music, Waves, type LucideIcon } from "lucide-react";

/**
 * Activities that can be attached to a log. To add one, append an entry here — `key` is what's
 * stored in `np_entry_activities.activity` (lowercase `[a-z0-9_]`, never rename an existing key).
 */
export const ACTIVITIES = [
  { key: "strength", label: "Strength", Icon: Dumbbell },
  { key: "run", label: "Run", Icon: Footprints },
  { key: "swim", label: "Swim", Icon: Waves },
  { key: "drums", label: "Drums", Icon: Drum },
  { key: "dance", label: "Dance", Icon: Music },
] as const satisfies readonly { key: string; label: string; Icon: LucideIcon }[];

export type ActivityKey = (typeof ACTIVITIES)[number]["key"];

/** Display info for a stored key; keys no longer in the list still render (generic icon). */
export function activityInfo(key: string): { label: string; Icon: LucideIcon } {
  return ACTIVITIES.find((a) => a.key === key) ?? { label: key, Icon: Activity };
}
