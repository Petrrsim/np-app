"use client";

import { createElement, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ACTIVITY_ICONS, activityIcon } from "@/lib/activities";
import { useDeleteListItem, useReorderList, useUpdateListItem, type ListKind } from "@/hooks/use-lists";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface ManagedItem {
  id: number;
  name: string;
  hidden: boolean;
  position: number | null;
  /** Activities only: icon name from ACTIVITY_ICONS. */
  icon?: string;
  /** Activities only: the stored key (needed to delete its log rows). */
  activityKey?: string;
}

const ICON_BTN = "size-8 text-muted-foreground";
const MOVE_BTN =
  "flex h-4.5 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-25";

function errMsg(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

function plural(n: number, word: string) {
  return `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
}

/** Grid of activity icons; `value` is highlighted. */
function IconGrid({ value, onPick }: { value: string; onPick: (name: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1" role="listbox" aria-label="Icon">
      {Object.entries(ACTIVITY_ICONS).map(([name, Icon]) => (
        <button
          key={name}
          type="button"
          role="option"
          aria-selected={value === name}
          aria-label={name}
          onClick={() => onPick(name)}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            value === name && "bg-foreground text-background hover:bg-foreground hover:text-background",
          )}
        >
          <Icon className="size-4" />
        </button>
      ))}
    </div>
  );
}

function IconButton({
  icon,
  onPick,
  disabled,
  label,
}: {
  icon: string;
  onPick: (name: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={label}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background/60 text-foreground transition-colors hover:bg-accent disabled:opacity-50"
        >
          {createElement(activityIcon(icon), { className: "size-4" })}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <IconGrid
          value={icon}
          onPick={(name) => {
            onPick(name);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function ItemRow({
  kind,
  item,
  count,
  Icon,
  withIcons,
  noun,
  onMove,
  canUp,
  canDown,
}: {
  kind: ListKind;
  item: ManagedItem;
  count: number | null;
  Icon: LucideIcon;
  withIcons: boolean;
  noun: string;
  onMove: (dir: -1 | 1) => void;
  canUp: boolean;
  canDown: boolean;
}) {
  const update = useUpdateListItem(kind);
  const remove = useDeleteListItem(kind);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(item.name);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = update.isPending || remove.isPending;

  async function save() {
    const name = draft.trim();
    if (!name || name === item.name) {
      setEditing(false);
      setDraft(item.name);
      return;
    }
    try {
      await update.mutateAsync({ id: item.id, name });
      setEditing(false);
    } catch (err) {
      toast.error(errMsg(err, "Failed to rename"));
    }
  }

  async function setHidden(hidden: boolean) {
    try {
      await update.mutateAsync({ id: item.id, hidden });
      toast.success(hidden ? `${item.name} hidden from new logs` : `${item.name} is back in the form`);
    } catch (err) {
      toast.error(errMsg(err, "Failed to update"));
    }
  }

  async function setIcon(icon: string) {
    try {
      await update.mutateAsync({ id: item.id, icon });
    } catch (err) {
      toast.error(errMsg(err, "Failed to change icon"));
    }
  }

  async function destroy() {
    try {
      await remove.mutateAsync({ id: item.id, activityKey: item.activityKey });
      toast.success(`${item.name} deleted`);
    } catch (err) {
      toast.error(errMsg(err, "Failed to delete"));
    }
  }

  return (
    <li className={cn("flex items-center gap-2 py-2", item.hidden && "opacity-60")}>
      <div className="-ml-1 flex shrink-0 flex-col">
        <button
          type="button"
          onClick={() => onMove(-1)}
          disabled={!canUp}
          aria-label={`Move ${item.name} up`}
          className={MOVE_BTN}
        >
          <ChevronUp className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onMove(1)}
          disabled={!canDown}
          aria-label={`Move ${item.name} down`}
          className={MOVE_BTN}
        >
          <ChevronDown className="size-3.5" />
        </button>
      </div>
      {withIcons ? (
        <IconButton icon={item.icon ?? "activity"} onPick={setIcon} disabled={busy} label={`Change ${item.name} icon`} />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Icon className="size-4" />
        </span>
      )}

      {editing ? (
        <form
          className="flex min-w-0 flex-1 items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input
            autoFocus
            value={draft}
            maxLength={40}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setEditing(false);
                setDraft(item.name);
              }
            }}
            aria-label={`New name for ${item.name}`}
            className="h-9"
          />
          <Button type="submit" variant="ghost" size="icon" className={ICON_BTN} disabled={busy} aria-label="Save name">
            {update.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={ICON_BTN}
            aria-label="Cancel rename"
            onClick={() => {
              setEditing(false);
              setDraft(item.name);
            }}
          >
            <X />
          </Button>
        </form>
      ) : (
        <>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex items-center gap-2 truncate text-sm font-medium">
              <span className="truncate">{item.name}</span>
              {item.hidden && (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Hidden
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {count === null ? "…" : count === 0 ? "Not used yet" : `On ${plural(count, "log")}`}
            </span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={ICON_BTN}
            aria-label={`Rename ${item.name}`}
            disabled={busy}
            onClick={() => {
              setDraft(item.name);
              setEditing(true);
            }}
          >
            <Pencil />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={ICON_BTN}
            aria-label={item.hidden ? `Show ${item.name} in the form` : `Hide ${item.name} from the form`}
            title={item.hidden ? "Show in the form" : "Hide from the form (keeps past logs)"}
            disabled={busy}
            onClick={() => void setHidden(!item.hidden)}
          >
            {item.hidden ? <Eye /> : <EyeOff />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className={cn(ICON_BTN, "hover:text-destructive")}
            aria-label={`Delete ${item.name}`}
            disabled={busy || count === null}
            onClick={() => setConfirmOpen(true)}
          >
            {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {count
                ? `This ${noun} is on ${plural(count, "log")}. Deleting removes it from all of them and can't be undone.${
                    item.hidden ? "" : " Hiding keeps your history and just takes it out of the form."
                  }`
                : `This ${noun} isn't on any log yet, so nothing else changes.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!!count && !item.hidden && (
              <AlertDialogAction
                className="bg-secondary text-foreground hover:bg-muted/80"
                onClick={() => void setHidden(true)}
              >
                <EyeOff />
                Hide instead
              </AlertDialogAction>
            )}
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void destroy()}
            >
              <Trash2 />
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

/**
 * Settings card for one user-managed list: add, reorder (↑/↓), rename, hide/show and delete
 * items (and pick icons for activities). Visible items first, hidden ones after, each in saved order.
 */
export function ListManager({
  kind,
  title,
  description,
  noun,
  placeholder,
  items,
  isPending,
  isError,
  counts,
  Icon,
  withIcons = false,
  onAdd,
}: {
  kind: ListKind;
  title: string;
  description: string;
  /** Lowercase singular, used in sentences ("activity", "person", "marker"). */
  noun: string;
  placeholder: string;
  items: ManagedItem[] | undefined;
  isPending: boolean;
  isError: boolean;
  /** Logs per item id; null while the history is still loading. */
  counts: Map<number, number> | null;
  /** Row icon for lists without per-item icons. */
  Icon: LucideIcon;
  withIcons?: boolean;
  onAdd: (name: string, icon: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("activity");
  const [adding, setAdding] = useState(false);
  const reorder = useReorderList(kind);
  // `items` arrive in saved order; hidden ones are grouped after the visible ones.
  const sorted = [...(items ?? [])].sort((a, b) => Number(a.hidden) - Number(b.hidden));
  const visible = sorted.filter((i) => !i.hidden).length;

  /** Swaps item `index` (in `sorted`) with its neighbour, within its visible/hidden group. */
  function move(index: number, dir: -1 | 1) {
    const other = index + dir;
    if (other < 0 || other >= sorted.length || sorted[other].hidden !== sorted[index].hidden) return;
    const ids = sorted.map((i) => i.id);
    [ids[index], ids[other]] = [ids[other], ids[index]];
    reorder.mutate(
      { ids, before: sorted },
      { onError: (err) => toast.error(errMsg(err, "Failed to save the new order")) },
    );
  }

  async function handleAdd() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (items?.some((i) => i.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`${trimmed} is already in the list`);
      return;
    }
    setAdding(true);
    try {
      await onAdd(trimmed, icon);
      setName("");
      setIcon("activity");
    } catch (err) {
      toast.error(errMsg(err, `Failed to add ${noun}`));
    } finally {
      setAdding(false);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          {title}
          {items && (
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {visible} in the form{sorted.length > visible ? ` · ${sorted.length - visible} hidden` : ""}
            </span>
          )}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {isPending ? (
          <div className="flex justify-center py-4">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <p className="text-sm text-destructive">Couldn&apos;t load this list.</p>
        ) : sorted.length === 0 ? (
          <p className="rounded-xl border border-dashed border-input p-3 text-center text-sm text-muted-foreground">
            Nothing here yet — add your first {noun} below.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {sorted.map((item, index) => (
              <ItemRow
                key={item.id}
                kind={kind}
                item={item}
                count={counts ? (counts.get(item.id) ?? 0) : null}
                Icon={Icon}
                withIcons={withIcons}
                noun={noun}
                onMove={(dir) => move(index, dir)}
                canUp={index > 0 && sorted[index - 1].hidden === item.hidden}
                canDown={index < sorted.length - 1 && sorted[index + 1].hidden === item.hidden}
              />
            ))}
          </ul>
        )}

        <form
          className="mt-1 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void handleAdd();
          }}
        >
          {withIcons && <IconButton icon={icon} onPick={setIcon} label="Pick an icon for the new activity" />}
          <Input
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            className="h-9"
          />
          <Button type="submit" size="sm" className="h-9 shrink-0" disabled={!name.trim() || adding || isError}>
            {adding ? <Loader2 className="animate-spin" /> : <Plus />}
            Add
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
