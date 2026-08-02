"use client";

import { useState } from "react";
import { Check, ChevronDown, Star, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface SavedView {
  id: string;
  name: string;
  isDefault: boolean;
}

export interface SavedViewsMenuProps {
  views: SavedView[];
  activeViewId: string | null;
  onLoad: (id: string) => void;
  onSave: (name: string) => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
  className?: string;
}

/**
 * Saved-views dropdown: load a view, save the current filters/sort/columns as a
 * new named view (inline input), mark one as the default, and delete with an
 * inline confirm step (avoids nesting a Dialog inside the Radix menu).
 */
export function SavedViewsMenu({
  views,
  activeViewId,
  onLoad,
  onSave,
  onSetDefault,
  onDelete,
  className,
}: SavedViewsMenuProps) {
  const [open, setOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const activeView = views.find((v) => v.id === activeViewId) ?? null;

  function handleSave() {
    const name = saveName.trim();
    if (!name) return;
    onSave(name);
    setSaveName("");
    setOpen(false);
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setConfirmDeleteId(null);
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className={className}>
          {activeView ? activeView.name : "Views"}
          <ChevronDown aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        {views.length === 0 ? (
          <p className="text-muted-foreground px-2 py-1.5 text-sm">
            No saved views yet.
          </p>
        ) : (
          views.map((view) => (
            <DropdownMenuItem
              key={view.id}
              onSelect={(e) => {
                if (confirmDeleteId === view.id) e.preventDefault();
              }}
              className="justify-between"
            >
              <button
                type="button"
                className="flex flex-1 items-center gap-2 text-left"
                onClick={() => {
                  onLoad(view.id);
                  setOpen(false);
                }}
              >
                {view.id === activeViewId ? (
                  <Check className="size-3.5 shrink-0" aria-hidden="true" />
                ) : (
                  <span className="size-3.5 shrink-0" aria-hidden="true" />
                )}
                <span className="flex-1 truncate">{view.name}</span>
                {view.isDefault && (
                  <span className="text-muted-foreground text-xs">default</span>
                )}
              </button>
              <span className="ml-2 flex items-center gap-1">
                <button
                  type="button"
                  aria-label={
                    view.isDefault
                      ? `${view.name} is the default view`
                      : `Set ${view.name} as default`
                  }
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetDefault(view.id);
                  }}
                  className="hover:text-foreground"
                >
                  <Star
                    className={cn(
                      "size-3.5",
                      view.isDefault
                        ? "fill-primary text-primary"
                        : "text-muted-foreground",
                    )}
                    aria-hidden="true"
                  />
                </button>
                {confirmDeleteId === view.id ? (
                  <button
                    type="button"
                    className="text-destructive text-xs font-medium"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(view.id);
                      setConfirmDeleteId(null);
                    }}
                  >
                    Confirm
                  </button>
                ) : (
                  <button
                    type="button"
                    aria-label={`Delete ${view.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(view.id);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" aria-hidden="true" />
                  </button>
                )}
              </span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Input
            className="h-8"
            value={saveName}
            placeholder="Save current as…"
            aria-label="New view name"
            onChange={(e) => setSaveName(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                handleSave();
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveName.trim().length === 0}
          >
            Save
          </Button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
