import { useState } from "react";
import { Check, ChevronDown, Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/lib/aria-types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0] + parts[1]![0]).toUpperCase();
}

export default function ProfileSwitcher({
  profiles,
  activeId,
  onSelect,
  onStartAddUser,
  onRenameProfile,
}: {
  profiles: UserProfile[];
  activeId: string;
  onSelect: (id: string) => void;
  onStartAddUser: (name: string) => void;
  onRenameProfile: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");

  const active = profiles.find((p) => p.id === activeId) ?? profiles[0];
  const label = active?.name ?? "User";

  const submitNewName = () => {
    const n = newName.trim();
    if (!n) return;
    setNameDialogOpen(false);
    setNewName("");
    setOpen(false);
    onStartAddUser(n);
  };

  const submitRename = () => {
    const n = renameInput.trim();
    if (!n || !renameTargetId) return;
    onRenameProfile(renameTargetId, n);
    setRenameOpen(false);
    setRenameTargetId(null);
    setRenameInput("");
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 gap-2 rounded-full border-border/80 px-3 font-medium"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-semibold">
              {initials(label)}
            </span>
            <span className="max-w-[140px] truncate text-sm">{label}</span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-1">
          <div className="px-2 py-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Calendars
          </div>
          <div className="flex flex-col gap-0.5">
            {profiles.map((p) => (
              <div
                key={p.id}
                className={cn(
                  "flex items-center gap-0.5 rounded-md pr-1",
                  p.id === activeId && "bg-muted/80",
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    onSelect(p.id);
                    setOpen(false);
                  }}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                >
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-semibold">
                    {initials(p.name)}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                  {p.id === activeId ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                  aria-label={`Rename ${p.name}`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setOpen(false);
                    setRenameTargetId(p.id);
                    setRenameInput(p.name);
                    setRenameOpen(true);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <div className="mt-1 border-t border-border/60 pt-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setNameDialogOpen(true);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <UserPlus className="h-4 w-4 shrink-0" />
              Add user
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add new user</DialogTitle>
            <DialogDescription>Enter a name for this calendar. You&apos;ll set up their schedule next.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="new-profile-name">Name</Label>
            <Input
              id="new-profile-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Alex"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitNewName();
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setNameDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={submitNewName} disabled={!newName.trim()}>
              Add new user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={renameOpen}
        onOpenChange={(next) => {
          setRenameOpen(next);
          if (!next) {
            setRenameTargetId(null);
            setRenameInput("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename calendar</DialogTitle>
            <DialogDescription>This label is only for you on this device—it doesn&apos;t sync elsewhere.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="rename-profile-name">Name</Label>
            <Input
              id="rename-profile-name"
              value={renameInput}
              onChange={(e) => setRenameInput(e.target.value)}
              placeholder="e.g. Me, Alex, Client A"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitRename();
              }}
              autoFocus
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setRenameOpen(false);
                setRenameTargetId(null);
                setRenameInput("");
              }}
            >
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={submitRename} disabled={!renameInput.trim()}>
              Save name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
