"use client";

import { useState } from "react";
import { Check, ChevronLeft, ChevronRight, FolderPlus, Loader2, Pencil, Plus, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";
import type { PersonGroup } from "@/types/db";
import { cn, errorMessage } from "@/lib/utils";
import { GROUP_COLORS, groupHex, nextGroupColor } from "@/lib/people";
import {
  useCreateGroup,
  useDeleteGroup,
  useSetMemberships,
  useUpdateGroup,
  type PeopleModel,
} from "@/hooks/use-people";
import { useReorderList } from "@/hooks/use-lists";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { PersonAvatar } from "@/components/people/person-avatar";

/** What the group editor is open for: an existing group, or a new one (optionally inside a parent). */
type Editing = { group: PersonGroup } | { group: null; parentId: number | null } | null;

/** A tappable person chip (avatar + name) that opens their profile. */
function PersonChip({ model, id, onOpen }: { model: PeopleModel; id: number; onOpen: (id: number) => void }) {
  const p = model.person(id);
  if (!p) return null;
  return (
    <button
      type="button"
      onClick={() => onOpen(id)}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-border/80 bg-card py-1 pl-1 pr-3 text-xs font-medium transition-all hover:-translate-y-px hover:shadow-sm active:scale-[0.97]",
        p.hidden && "opacity-60",
      )}
    >
      <PersonAvatar name={p.name} color={model.colorOf(id)} size={24} />
      {p.name}
    </button>
  );
}

function GroupCard({
  model,
  group,
  depth,
  onOpen,
  onEdit,
}: {
  model: PeopleModel;
  group: PersonGroup;
  depth: number;
  onOpen: (id: number) => void;
  onEdit: (editing: Editing) => void;
}) {
  const { tree } = model;
  const hex = groupHex(group.color);
  const order = new Map(model.people.map((p, i) => [p.id, i]));
  const members = group.members
    .filter((id) => model.person(id))
    .sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
  const total = tree.allMembers(group.id).filter((id) => model.person(id)).length;
  const subgroups = tree.childrenOf(group.id);
  const top = depth === 0;
  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: hex }} aria-hidden />
          <h3 className={cn("truncate font-semibold", top ? "text-sm" : "text-[13px]")} style={{ color: hex }}>
            {group.name}
          </h3>
          <span
            className="shrink-0 text-xs tabular-nums text-muted-foreground"
            title={subgroups.length ? `${total} people, including its subgroups` : `${total} people`}
          >
            {total}
          </span>
        </div>
        <div className="-mr-1.5 flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Add a subgroup to ${group.name}`}
            title="Add a subgroup"
            onClick={() => onEdit({ group: null, parentId: group.id })}
          >
            <FolderPlus />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Edit ${group.name}`}
            onClick={() => onEdit({ group })}
          >
            <Pencil />
          </Button>
        </div>
      </div>
      {members.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {members.map((id) => (
            <PersonChip key={id} model={model} id={id} onOpen={onOpen} />
          ))}
        </div>
      ) : (
        subgroups.length === 0 && (
          <button
            type="button"
            onClick={() => onEdit({ group })}
            className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            No one yet — add people
          </button>
        )
      )}
      {subgroups.length > 0 && (
        <div className={cn("grid gap-2", top && subgroups.length > 1 && "sm:grid-cols-2")}>
          {subgroups.map((c) => (
            <GroupCard key={c.id} model={model} group={c} depth={depth + 1} onOpen={onOpen} onEdit={onEdit} />
          ))}
        </div>
      )}
    </>
  );

  if (!top) {
    return (
      <div
        className="flex min-w-0 flex-col gap-2.5 rounded-xl border border-l-[3px] bg-card/80 p-3"
        style={{
          borderColor: `color-mix(in srgb, ${hex} 22%, var(--border))`,
          borderLeftColor: hex,
          background: `linear-gradient(160deg, color-mix(in srgb, ${hex} 6%, white), white 70%)`,
        }}
      >
        {body}
      </div>
    );
  }
  return (
    <Card
      className={cn(
        "relative flex min-w-0 flex-col gap-3 overflow-hidden p-4",
        subgroups.length > 0 && "sm:col-span-2",
      )}
      style={{
        borderColor: `color-mix(in srgb, ${hex} 22%, var(--border))`,
        background: `linear-gradient(160deg, color-mix(in srgb, ${hex} 8%, white) 0%, white 55%)`,
      }}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: hex, opacity: 0.75 }} aria-hidden />
      {body}
    </Card>
  );
}

/**
 * Groups as a tree: top-level cards, subgroups nested inside their parent (any depth), each
 * with its direct members as chips. A group counts everyone in its subgroups too.
 */
export function GroupsSection({ model, onOpen }: { model: PeopleModel; onOpen: (id: number) => void }) {
  const [editing, setEditing] = useState<Editing>(null);
  const grouped = new Set(model.groups.flatMap((g) => g.members));
  const loose = model.people.filter((p) => !grouped.has(p.id)).map((p) => p.id);
  const roots = model.tree.childrenOf(null);

  return (
    <section className="flex flex-col gap-2">
      <div className="mt-2 flex items-end justify-between gap-2 px-1">
        <div>
          <h2 className="text-sm font-semibold">Groups</h2>
          <p className="text-xs text-muted-foreground">Circles of people — groups can sit inside groups.</p>
        </div>
        {model.groups.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setEditing({ group: null, parentId: null })}
          >
            <Plus />
            New group
          </Button>
        )}
      </div>

      {model.groups.length === 0 ? (
        <button
          type="button"
          onClick={() => setEditing({ group: null, parentId: null })}
          className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-input bg-card/50 px-4 py-6 text-center transition-colors hover:bg-card"
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <UsersRound className="size-5 text-muted-foreground" />
          </span>
          <span className="text-sm font-medium">Create your first group</span>
          <span className="max-w-xs text-xs text-muted-foreground">
            Put your brother, mum and dad into &ldquo;Family&rdquo; — or nest &ldquo;Dance Class&rdquo; and
            &ldquo;Work&rdquo; inside &ldquo;Madeira&rdquo;. Each group gets a colour and a halo on your web.
          </span>
        </button>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {roots.map((g) => (
            <GroupCard key={g.id} model={model} group={g} depth={0} onOpen={onOpen} onEdit={setEditing} />
          ))}
          {loose.length > 0 && (
            <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-input p-4">
              <div className="flex items-center gap-2">
                <span className="size-2.5 rounded-full border border-muted-foreground/50" aria-hidden />
                <h3 className="text-sm font-semibold text-muted-foreground">Not in a group</h3>
                <span className="text-xs tabular-nums text-muted-foreground">{loose.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {loose.map((id) => (
                  <PersonChip key={id} model={model} id={id} onOpen={onOpen} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <GroupEditor
        key={editing === null ? "closed" : editing.group ? editing.group.id : `new-${editing.parentId}`}
        model={model}
        editing={editing}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

/** Create or edit a group: name, colour, which group it's inside, direct members, order; delete. */
function GroupEditor({ model, editing, onClose }: { model: PeopleModel; editing: Editing; onClose: () => void }) {
  const { tree } = model;
  const existing = editing?.group ?? null;
  const create = useCreateGroup();
  const update = useUpdateGroup();
  const remove = useDeleteGroup();
  const reorder = useReorderList("groups");
  const setMemberships = useSetMemberships();
  const [name, setName] = useState(existing?.name ?? "");
  const [color, setColor] = useState(existing?.color ?? nextGroupColor(model.groups.map((g) => g.color)));
  const [parentId, setParentId] = useState<number | null>(
    existing ? tree.parentOf(existing.id) : editing && !editing.group ? editing.parentId : null,
  );
  const [members, setMembers] = useState<number[]>(existing?.members ?? []);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = create.isPending || update.isPending || setMemberships.isPending;
  const hex = groupHex(color);

  // Can't go inside itself or one of its own subgroups.
  const blocked = new Set(existing ? [existing.id, ...tree.descendants(existing.id)] : []);
  const parents = tree.ordered.filter(({ group }) => !blocked.has(group.id));
  const siblings = existing ? tree.childrenOf(tree.parentOf(existing.id)) : [];
  const index = existing ? siblings.findIndex((g) => g.id === existing.id) : -1;
  const subgroups = existing ? tree.childrenOf(existing.id) : [];
  const parentName = (id: number | null) => (id === null ? "the top level" : (tree.group(id)?.name ?? "its parent"));

  function toggle(id: number) {
    setMembers((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]));
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Give the group a name");
      return;
    }
    if (model.groups.some((g) => g.id !== existing?.id && g.name.toLowerCase() === trimmed.toLowerCase())) {
      toast.error(`Group "${trimmed}" already exists`);
      return;
    }
    try {
      if (!existing) {
        await create.mutateAsync({ name: trimmed, color, memberIds: members, parentId });
      } else {
        const oldParent = tree.parentOf(existing.id);
        if (trimmed !== existing.name || color !== existing.color || parentId !== oldParent) {
          await update.mutateAsync({
            id: existing.id,
            name: trimmed,
            color,
            ...(parentId !== oldParent && { parentId }),
          });
        }
        const before = new Set(existing.members);
        const after = new Set(members);
        const changes = [
          ...members
            .filter((id) => !before.has(id))
            .map((personId) => ({ groupId: existing.id, personId, member: true })),
          ...existing.members
            .filter((id) => !after.has(id))
            .map((personId) => ({ groupId: existing.id, personId, member: false })),
        ];
        if (changes.length > 0) await setMemberships.mutateAsync(changes);
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't save the group"));
    }
  }

  /** Swaps the group with its neighbouring sibling (order is saved for the whole flat list). */
  function move(dir: -1 | 1) {
    if (!existing) return;
    const other = siblings[index + dir];
    if (!other) return;
    const ids = model.groups.map((g) => g.id);
    const a = ids.indexOf(existing.id);
    const b = ids.indexOf(other.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    reorder.mutate(
      { ids, before: model.groups },
      { onError: (err) => toast.error(errorMessage(err, "Couldn't move the group")) },
    );
  }

  async function destroy() {
    if (!existing) return;
    try {
      await remove.mutateAsync({ id: existing.id, parentId: tree.parentOf(existing.id) });
      toast.success(`${existing.name} deleted — its people are still here`);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, "Couldn't delete the group"));
    }
  }

  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100svh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="size-3 rounded-full transition-colors" style={{ background: hex }} aria-hidden />
            {existing ? "Edit group" : parentId !== null ? `New group in ${parentName(parentId)}` : "New group"}
          </DialogTitle>
          <DialogDescription>
            {existing ? "Rename, recolour, move or change who's in it." : "Name it, pick a colour, choose who's in it."}
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex min-w-0 flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input
            autoFocus={!existing}
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            placeholder={parentId !== null ? "Dance Class" : "Family"}
            aria-label="Group name"
            style={{ color: name ? hex : undefined }}
            className="h-11 text-base font-semibold"
          />

          {/* 32 colours in four rows of 8; cells shrink on narrow phones. */}
          <div className="flex flex-col gap-1.5">
            <div role="radiogroup" aria-label="Colour" className="grid grid-cols-8 gap-2 px-0.5">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={color === c.key}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => setColor(c.key)}
                  className={cn(
                    "flex aspect-square w-full max-w-9 items-center justify-center justify-self-center rounded-full transition-transform hover:scale-110",
                    color === c.key && "ring-2 ring-offset-2 ring-offset-card",
                  )}
                  style={{ background: c.hex, ["--tw-ring-color" as string]: c.hex }}
                >
                  {color === c.key && <Check className="size-4 text-white" strokeWidth={3} />}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-muted-foreground">
              {GROUP_COLORS.find((c) => c.key === color)?.label ?? "Colour"}
            </span>
          </div>

          {parents.length > 0 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Inside</span>
              <select
                value={parentId ?? ""}
                onChange={(e) => setParentId(e.target.value === "" ? null : Number(e.target.value))}
                className="h-10 w-full rounded-lg border border-input bg-background/60 px-3 text-sm focus-visible:border-ring/40 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/10"
              >
                <option value="">Nothing — a top-level group</option>
                {parents.map(({ group, depth }) => (
                  <option key={group.id} value={group.id}>
                    {"   ".repeat(depth)}
                    {depth > 0 ? "› " : ""}
                    {group.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              Who&apos;s in it{members.length > 0 && ` · ${members.length}`}
            </span>
            {model.people.length === 0 ? (
              <p className="text-xs text-muted-foreground">Add people first.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {model.people.map((p) => {
                  const on = members.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(p.id)}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-card py-1 pl-1 pr-3 text-xs font-medium text-muted-foreground transition-all hover:bg-accent active:scale-[0.97]"
                      style={
                        on
                          ? {
                              borderColor: `color-mix(in srgb, ${hex} 50%, transparent)`,
                              background: `color-mix(in srgb, ${hex} 11%, white)`,
                              color: hex,
                            }
                          : undefined
                      }
                    >
                      <PersonAvatar name={p.name} color={on ? hex : null} size={22} className="border-0" />
                      {p.name}
                      {on && <Check className="size-3" strokeWidth={2.5} />}
                    </button>
                  );
                })}
              </div>
            )}
            {subgroups.length > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Everyone in {subgroups.map((g) => g.name).join(", ")} belongs to {existing?.name} too — no need to add
                them here.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 pt-4">
            {existing && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Move group earlier"
                  disabled={index <= 0 || reorder.isPending}
                  onClick={() => move(-1)}
                >
                  <ChevronLeft />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label="Move group later"
                  disabled={index >= siblings.length - 1 || reorder.isPending}
                  onClick={() => move(1)}
                >
                  <ChevronRight />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmOpen(true)}
                >
                  <Trash2 />
                  Delete
                </Button>
              </>
            )}
            <Button type="button" variant="ghost" size="sm" className="ml-auto" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              {existing ? "Save" : "Create"}
            </Button>
          </div>
        </form>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {existing?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Only the group goes — its people, their notes and connections stay.
                {subgroups.length > 0 &&
                  ` ${subgroups.map((g) => g.name).join(", ")} move${subgroups.length === 1 ? "s" : ""} up into ${parentName(
                    existing ? tree.parentOf(existing.id) : null,
                  )}.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => void destroy()}
              >
                <Trash2 />
                Delete group
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
