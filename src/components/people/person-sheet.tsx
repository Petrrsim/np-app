"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ChevronLeft, Eye, EyeOff, Link2, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { LinkTone, Person, PersonLink } from "@/types/db";
import { cn, errorMessage } from "@/lib/utils";
import { todayDay } from "@/lib/stats";
import { VIBE_LABELS, averageNp, connectionsOf, fmtAgo, nextGroupColor, type PersonStats } from "@/lib/people";
import {
  useCreateGroup,
  useDeleteLink,
  useSaveLink,
  useSavePersonNote,
  useSaveVibe,
  useSetMemberships,
  type PeopleModel,
} from "@/hooks/use-people";
import { useDeleteListItem, useUpdateListItem } from "@/hooks/use-lists";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NP_OPTIONS } from "@/components/people-picker";
import { PersonAvatar } from "@/components/people/person-avatar";
import { TonePill, ToneTiles } from "@/components/people/tone";
import { GroupChip } from "@/components/people/group-chip";

const SECTION = "flex flex-col gap-2";
const SECTION_TITLE = "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const CHIP =
  "flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all duration-200 hover:bg-accent active:scale-[0.97]";

/**
 * A person's profile, opened from anywhere on the People page: name, log stats, the living
 * note (autosaves), groups, connections, hide / delete. Tapping a connected person opens them
 * (with a back button to return).
 */
export function PersonSheet({
  model,
  personId,
  backTo,
  onBack,
  onOpen,
  onClose,
}: {
  model: PeopleModel;
  personId: number | null;
  /** Person the back button returns to, if any. */
  backTo: number | null;
  onBack: () => void;
  onOpen: (id: number) => void;
  onClose: () => void;
}) {
  const person = personId !== null ? model.person(personId) : undefined;
  const scroller = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [personId]);

  return (
    <Dialog open={!!person} onOpenChange={(open) => !open && onClose()}>
      <DialogContent ref={scroller} className="max-h-[calc(100svh-2rem)] gap-0 overflow-y-auto p-0 sm:max-w-lg">
        {person && (
          <Profile
            key={person.id}
            model={model}
            person={person}
            backName={backTo !== null ? model.nameOf(backTo) : null}
            onBack={onBack}
            onOpen={onOpen}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Profile({
  model,
  person,
  backName,
  onBack,
  onOpen,
  onClose,
}: {
  model: PeopleModel;
  person: Person;
  backName: string | null;
  onBack: () => void;
  onOpen: (id: number) => void;
  onClose: () => void;
}) {
  const color = model.colorOf(person.id);
  const stats = model.stats?.get(person.id);
  const logCount = model.stats ? (stats?.count ?? 0) : null;

  return (
    // One min-w-0 grid item: the dialog is a grid, and its auto column would otherwise grow to fit wide content.
    <div className="min-w-0">
      {/* Header, washed in the person's group colour */}
      <div
        className="relative flex flex-col gap-3 border-b border-border/70 px-5 pb-4 pt-5"
        style={{
          background: color
            ? `linear-gradient(180deg, color-mix(in srgb, ${color} 10%, white), white)`
            : "linear-gradient(180deg, var(--muted), var(--card))",
        }}
      >
        {backName && (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 flex items-center gap-0.5 self-start rounded-md px-1 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" />
            {backName}
          </button>
        )}
        <div className="flex items-center gap-3 pr-6">
          <PersonAvatar
            name={person.name}
            color={color}
            size={56}
            hidden={person.hidden}
            vibe={person.vibe}
            className="shadow-sm"
          />
          <NameEditor person={person} />
        </div>
        <StatsStrip stats={stats} loading={!model.stats} />
      </div>

      <div className="flex flex-col gap-5 px-5 py-4">
        <VibeEditor person={person} />
        <NoteEditor person={person} />
        <GroupsEditor model={model} person={person} />
        <Connections model={model} person={person} onOpen={onOpen} />
        <Danger person={person} logCount={logCount} onDeleted={onClose} />
      </div>
    </div>
  );
}

function NameEditor({ person }: { person: Person }) {
  const update = useUpdateListItem("people");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(person.name);

  async function save() {
    const name = draft.trim();
    if (!name || name === person.name) {
      setEditing(false);
      return;
    }
    try {
      await update.mutateAsync({ id: person.id, name });
      setEditing(false);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to rename"));
    }
  }

  if (editing) {
    return (
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
              e.stopPropagation();
              setEditing(false);
            }
          }}
          aria-label="Name"
          className="h-9 bg-card"
        />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Save name"
          disabled={update.isPending}
        >
          {update.isPending ? <Loader2 className="animate-spin" /> : <Check />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label="Cancel"
          onClick={() => setEditing(false)}
        >
          <X />
        </Button>
      </form>
    );
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="flex min-w-0 items-center gap-1.5">
        <DialogTitle className="truncate text-xl font-semibold tracking-tight">{person.name}</DialogTitle>
        <button
          type="button"
          onClick={() => {
            setDraft(person.name);
            setEditing(true);
          }}
          aria-label={`Rename ${person.name}`}
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>
      <DialogDescription className="text-xs">
        {person.hidden ? "Hidden from New Entry · still on past logs" : "Offered in New Entry"}
      </DialogDescription>
    </div>
  );
}

/** Logs · last seen · NP split, and their NP on recent logs as little level bars. */
function StatsStrip({ stats, loading }: { stats: PersonStats | undefined; loading: boolean }) {
  if (loading) return <div className="h-14 animate-pulse rounded-xl bg-card/60" />;
  if (!stats) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card/60 px-3 py-2.5 text-xs text-muted-foreground">
        Not on any log yet — tag them in New Entry and their NP shows up here.
      </p>
    );
  }
  const avg = averageNp(stats)!;
  const typical = NP_OPTIONS[Math.min(3, Math.max(1, Math.round(avg))) as 1 | 2 | 3];
  return (
    <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-px overflow-hidden rounded-xl border border-border/80 bg-border/80 text-xs">
      <div className="flex flex-col gap-0.5 bg-card px-3 py-2">
        <span className="text-muted-foreground">Logs</span>
        <span className="text-base font-semibold tabular-nums">{stats.count.toLocaleString()}</span>
      </div>
      <div className="flex flex-col gap-0.5 bg-card px-3 py-2">
        <span className="text-muted-foreground">Last seen</span>
        <span className="text-sm font-semibold">{fmtAgo(todayDay() - stats.lastDay)}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-1 bg-card px-3 py-2">
        <span className="flex items-center justify-between gap-2 text-muted-foreground">
          NP
          <span className={cn("inline-flex items-center gap-1 font-medium", typical.text)}>
            <typical.Icon className="size-3.5" />
            {avg.toFixed(1)}
          </span>
        </span>
        {/* Recent NP: one bar per log, height = level */}
        <span className="flex h-5 items-end justify-end gap-0.5 overflow-hidden" aria-label="NP on recent logs">
          {stats.recent.map((np, i) => (
            <span
              key={i}
              className={cn("w-1.5 shrink-0 rounded-full", NP_OPTIONS[np].bar)}
              style={{ height: `${(np / 3) * 100}%`, opacity: 0.45 + (0.55 * (i + 1)) / stats.recent.length }}
            />
          ))}
        </span>
      </div>
    </div>
  );
}

/**
 * "You & {name}": your own energy with them — Energizing / Neutral / Draining (tap the picked
 * one again to clear). Saves at once.
 */
function VibeEditor({ person }: { person: Person }) {
  const save = useSaveVibe();

  function setTone(vibe: LinkTone | null) {
    save.mutate(
      { id: person.id, vibe },
      { onError: (err) => toast.error(errorMessage(err, "Couldn't save your energy")) },
    );
  }

  return (
    <section className={SECTION}>
      <h3 className={SECTION_TITLE}>Your energy with {person.name}</h3>
      <ToneTiles
        value={person.vibe}
        onChange={setTone}
        labels={VIBE_LABELS}
        clearable
        ariaLabel={`Your energy with ${person.name}`}
      />
    </section>
  );
}

/** The living note: autosaves ~1s after you stop typing, on blur, and when the profile closes. */
function NoteEditor({ person }: { person: Person }) {
  const save = useSavePersonNote();
  const [draft, setDraft] = useState(person.note);
  const [saved, setSaved] = useState(person.note);
  const latest = useRef(person.note);
  const savedRef = useRef(person.note);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const { mutate } = save;
  const id = person.id;

  const flushRef = useRef(() => {});
  useEffect(() => {
    flushRef.current = () => {
      clearTimeout(timer.current);
      const text = latest.current;
      if (text === savedRef.current) return;
      const before = savedRef.current;
      savedRef.current = text;
      setSaved(text);
      mutate(
        { id, note: text, at: new Date().toISOString() },
        {
          onError: (err) => {
            savedRef.current = before;
            setSaved(before);
            toast.error(errorMessage(err, "Note not saved"));
          },
        },
      );
    };
  });
  // Closing the profile (or switching person) saves what's pending.
  useEffect(() => () => flushRef.current(), []);

  const dirty = draft !== saved;
  const status = save.isPending
    ? "Saving…"
    : dirty
      ? "Editing…"
      : save.isSuccess
        ? "Saved"
        : person.note_updated_at
          ? `Updated ${fmtAgo(todayDay() - toLocalDay(person.note_updated_at))}`
          : null;

  return (
    <section className={SECTION}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`note-${person.id}`} className={SECTION_TITLE}>
          About {person.name}
        </label>
        {status && (
          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
            {save.isPending && <Loader2 className="size-3 animate-spin" />}
            {status}
          </span>
        )}
      </div>
      <Textarea
        id={`note-${person.id}`}
        value={draft}
        maxLength={20000}
        onChange={(e) => {
          setDraft(e.target.value);
          latest.current = e.target.value;
          clearTimeout(timer.current);
          timer.current = setTimeout(() => flushRef.current(), 1000);
        }}
        onBlur={() => flushRef.current()}
        placeholder={`What matters about ${person.name}? Work, family, birthday, what they're going through…`}
        className="max-h-80 min-h-28 resize-y bg-card leading-relaxed [field-sizing:content]"
      />
    </section>
  );
}

/** Local calendar day (epoch days) of an ISO timestamp, to compare with todayDay(). */
function toLocalDay(iso: string): number {
  const d = new Date(iso);
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000);
}

function GroupsEditor({ model, person }: { model: PeopleModel; person: Person }) {
  const setMemberships = useSetMemberships();
  const createGroup = useCreateGroup();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const mine = new Set(model.groupsOf(person.id).map((g) => g.id));
  const via = new Set(model.memberships(person.id).flatMap((m) => (m.direct ? [] : [m.group.id])));
  // For a "via" group: which of its subgroups they're directly in.
  const viaNames = (groupId: number) =>
    model.tree
      .descendants(groupId)
      .filter((id) => mine.has(id))
      .map((id) => model.tree.group(id)?.name ?? "");

  function toggle(groupId: number) {
    setMemberships.mutate([{ groupId, personId: person.id, member: !mine.has(groupId) }], {
      onError: (err) => toast.error(errorMessage(err, "Couldn't change the group")),
    });
  }

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await createGroup.mutateAsync({
        name: trimmed,
        color: nextGroupColor(model.groups.map((g) => g.color)),
        memberIds: [person.id],
      });
      setName("");
      setAdding(false);
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't create the group"));
    }
  }

  return (
    <section className={SECTION}>
      <h3 className={SECTION_TITLE}>Groups</h3>
      <div className="flex flex-wrap items-center gap-2">
        {model.tree.ordered.map(({ group }) => (
          <GroupChip
            key={group.id}
            tree={model.tree}
            group={group}
            state={mine.has(group.id) ? "on" : via.has(group.id) ? "via" : "off"}
            via={via.has(group.id) ? viaNames(group.id) : undefined}
            onClick={() => toggle(group.id)}
          />
        ))}
        {adding ? (
          <form
            className="flex items-center gap-1"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <Input
              autoFocus
              value={name}
              maxLength={40}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  setAdding(false);
                }
              }}
              placeholder="Family, Work…"
              aria-label="New group name"
              className="h-8 w-36 rounded-full bg-card text-xs"
            />
            <Button
              type="submit"
              size="icon"
              className="size-8 rounded-full"
              disabled={!name.trim() || createGroup.isPending}
              aria-label="Create group"
            >
              {createGroup.isPending ? <Loader2 className="animate-spin" /> : <Check />}
            </Button>
          </form>
        ) : (
          <button type="button" onClick={() => setAdding(true)} className={cn(CHIP, "border-dashed")}>
            <Plus className="size-3.5" />
            New group
          </button>
        )}
      </div>
    </section>
  );
}

function Connections({ model, person, onOpen }: { model: PeopleModel; person: Person; onOpen: (id: number) => void }) {
  const ties = connectionsOf(person.id, model.links, model.nameOf);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const linked = new Set(ties.map((t) => t.other));
  const candidates = model.people.filter((p) => p.id !== person.id && !linked.has(p.id));

  return (
    <section className={SECTION}>
      <h3 className={SECTION_TITLE}>Connections{ties.length > 0 && ` · ${ties.length}`}</h3>
      {ties.length > 0 && (
        <ul className="flex flex-col divide-y divide-border/70 rounded-xl border border-border/80">
          {ties.map(({ link, other }) =>
            editing === link.id ? (
              <li key={link.id} className="p-3">
                <LinkEditor
                  model={model}
                  person={person}
                  link={link}
                  fixedOther={other}
                  candidates={[]}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={link.id} className="flex items-center gap-3 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => onOpen(other)}
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  aria-label={`Open ${model.nameOf(other)}`}
                >
                  <PersonAvatar name={model.nameOf(other)} color={model.colorOf(other)} size={32} />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">{model.nameOf(other)}</span>
                    <TonePill tone={link.tone} label={link.label} className="max-w-full self-start" />
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  aria-label={`Edit connection with ${model.nameOf(other)}`}
                  onClick={() => setEditing(link.id)}
                >
                  <Pencil />
                </Button>
              </li>
            ),
          )}
        </ul>
      )}

      {editing === "new" ? (
        <div className="rounded-xl border border-border/80 p-3">
          <LinkEditor
            model={model}
            person={person}
            link={null}
            fixedOther={null}
            candidates={candidates}
            onDone={() => setEditing(null)}
          />
        </div>
      ) : candidates.length > 0 ? (
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-input py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Link2 className="size-4" />
          Connect {person.name} with…
        </button>
      ) : (
        ties.length === 0 && (
          <p className="text-xs text-muted-foreground">Add more people to connect {person.name} with them.</p>
        )
      )}
    </section>
  );
}

/** Create (pick a person) or edit a connection: tone tiles + a short label. */
function LinkEditor({
  model,
  person,
  link,
  fixedOther,
  candidates,
  onDone,
}: {
  model: PeopleModel;
  person: Person;
  link: PersonLink | null;
  fixedOther: number | null;
  candidates: Person[];
  onDone: () => void;
}) {
  const saveLink = useSaveLink();
  const deleteLink = useDeleteLink();
  const [other, setOther] = useState<number | null>(fixedOther);
  const [tone, setTone] = useState<LinkTone>(link?.tone ?? 0);
  const [label, setLabel] = useState(link?.label ?? "");

  async function save() {
    if (other === null) {
      toast.error("Pick who they're connected with");
      return;
    }
    try {
      await saveLink.mutateAsync({ a: person.id, b: other, tone, label });
      onDone();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the connection"));
    }
  }

  function remove() {
    if (!link) return;
    deleteLink.mutate(link.id, {
      onSuccess: () => toast.success(`Disconnected ${person.name} and ${model.nameOf(fixedOther ?? 0)}`),
      onError: (err) => toast.error(errorMessage(err, "Couldn't remove the connection")),
    });
    onDone();
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {fixedOther === null ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Connect {person.name} with</span>
          <div className="flex flex-wrap gap-1.5">
            {candidates.map((p) => {
              const on = other === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setOther(on ? null : p.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-xs font-medium text-muted-foreground transition-all hover:bg-accent active:scale-[0.97]",
                    on && "border-foreground bg-foreground text-background hover:bg-foreground/90",
                  )}
                >
                  <PersonAvatar name={p.name} color={model.colorOf(p.id)} size={22} className="border-0" />
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <span className="flex items-center gap-2 text-sm font-medium">
          <PersonAvatar name={model.nameOf(fixedOther)} color={model.colorOf(fixedOther)} size={24} />
          {person.name} <span className="text-muted-foreground">&</span> {model.nameOf(fixedOther)}
        </span>
      )}
      <ToneTiles value={tone} onChange={setTone} />
      <Input
        value={label}
        maxLength={80}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Name it — e.g. strong and prosperous partnership"
        aria-label="Connection name"
        className="bg-card"
      />
      <div className="flex items-center gap-2">
        {link && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mr-auto text-muted-foreground hover:text-destructive"
            onClick={remove}
          >
            <Trash2 />
            Disconnect
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" className={cn(!link && "ml-auto")} onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saveLink.isPending || other === null}>
          {saveLink.isPending ? <Loader2 className="animate-spin" /> : <Check />}
          {link ? "Save" : "Connect"}
        </Button>
      </div>
    </form>
  );
}

function Danger({ person, logCount, onDeleted }: { person: Person; logCount: number | null; onDeleted: () => void }) {
  const update = useUpdateListItem("people");
  const remove = useDeleteListItem("people");
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function setHidden(hidden: boolean) {
    try {
      await update.mutateAsync({ id: person.id, hidden });
      toast.success(hidden ? `${person.name} hidden from new logs` : `${person.name} is back in New Entry`);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to update"));
    }
  }

  async function destroy() {
    try {
      await remove.mutateAsync({ id: person.id });
      toast.success(`${person.name} deleted`);
      onDeleted();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete"));
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
      <Button
        variant="outline"
        size="sm"
        disabled={update.isPending}
        onClick={() => void setHidden(!person.hidden)}
        title={person.hidden ? "Offer them in New Entry again" : "Keep them on past logs, but out of New Entry"}
      >
        {update.isPending ? <Loader2 className="animate-spin" /> : person.hidden ? <Eye /> : <EyeOff />}
        {person.hidden ? "Show in New Entry" : "Hide from New Entry"}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto text-muted-foreground hover:text-destructive"
        disabled={remove.isPending || logCount === null}
        onClick={() => setConfirmOpen(true)}
      >
        {remove.isPending ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Delete
      </Button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {person.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {logCount
                ? `${person.name} is on ${logCount.toLocaleString()} ${logCount === 1 ? "log" : "logs"}. Deleting removes them from all of them, along with their note, groups and connections. This can't be undone.${
                    person.hidden ? "" : " Hiding keeps your history and just takes them out of New Entry."
                  }`
                : `${person.name} isn't on any log. Their note, groups and connections are deleted too.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            {!!logCount && !person.hidden && (
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
    </div>
  );
}
