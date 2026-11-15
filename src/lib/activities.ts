import {
  Activity,
  Baby,
  Bath,
  Bike,
  BookOpen,
  Brain,
  Briefcase,
  Camera,
  Car,
  ChefHat,
  Code,
  Coffee,
  Dog,
  Drum,
  Dumbbell,
  Film,
  Flame,
  Flower,
  Flower2,
  Footprints,
  Gamepad2,
  GraduationCap,
  Guitar,
  Hammer,
  HeartPulse,
  Laptop,
  Mic,
  Moon,
  Mountain,
  Music,
  Palette,
  PenLine,
  PersonStanding,
  Plane,
  Sailboat,
  Snowflake,
  Sparkles,
  Sprout,
  Sun,
  Swords,
  Target,
  Tent,
  Trees,
  Trophy,
  Users,
  Utensils,
  Volleyball,
  Waves,
  Wine,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ActivityType } from "@/types/db";

/**
 * Icons an activity can use, by the name stored in `np_activities.icon`. Add freely; never
 * rename or remove a name that may be stored (unknown names fall back to the generic icon).
 */
export const ACTIVITY_ICONS: Record<string, LucideIcon> = {
  activity: Activity,
  dumbbell: Dumbbell,
  footprints: Footprints,
  waves: Waves,
  bike: Bike,
  mountain: Mountain,
  volleyball: Volleyball,
  swords: Swords,
  snowflake: Snowflake,
  sailboat: Sailboat,
  "heart-pulse": HeartPulse,
  "flower-2": Flower2,
  "person-standing": PersonStanding,
  flower: Flower,
  brain: Brain,
  drum: Drum,
  music: Music,
  guitar: Guitar,
  mic: Mic,
  palette: Palette,
  "pen-line": PenLine,
  camera: Camera,
  film: Film,
  "book-open": BookOpen,
  "graduation-cap": GraduationCap,
  briefcase: Briefcase,
  laptop: Laptop,
  code: Code,
  hammer: Hammer,
  "chef-hat": ChefHat,
  utensils: Utensils,
  coffee: Coffee,
  wine: Wine,
  "gamepad-2": Gamepad2,
  users: Users,
  baby: Baby,
  dog: Dog,
  trees: Trees,
  sprout: Sprout,
  tent: Tent,
  plane: Plane,
  car: Car,
  sun: Sun,
  moon: Moon,
  bath: Bath,
  target: Target,
  trophy: Trophy,
  flame: Flame,
  zap: Zap,
  sparkles: Sparkles,
};

export function activityIcon(name: string | undefined): LucideIcon {
  return (name && ACTIVITY_ICONS[name]) || Activity;
}

export interface ActivityInfo {
  label: string;
  Icon: LucideIcon;
}

export type ActivityLookup = (key: string) => ActivityInfo;

/**
 * Display info by stored key, from the user's activity list (`np_activities`). Keys that are
 * no longer in the list (or while it's loading) still render: the key as label, generic icon.
 */
export function makeActivityLookup(list: ActivityType[] | undefined): ActivityLookup {
  const byKey = new Map((list ?? []).map((a) => [a.key, a]));
  return (key) => {
    const a = byKey.get(key);
    return a ? { label: a.label, Icon: activityIcon(a.icon) } : { label: key, Icon: Activity };
  };
}

/**
 * A new, unused storage key for `label` (lowercase `[a-z0-9_]`, starts with a letter — the
 * `np_entry_activities.activity` check). "Běh" → "beh"; taken → "beh_2", "beh_3", …
 */
export function activityKeyFor(label: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  let base = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
  if (!base) base = "activity";
  else if (!/^[a-z]/.test(base)) base = `a_${base}`;
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) if (!used.has(`${base}_${n}`)) return `${base}_${n}`;
}
