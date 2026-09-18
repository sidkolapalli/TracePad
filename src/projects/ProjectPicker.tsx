import { useEffect, useRef, useState } from "react";
import {
  Archive,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  Folder,
  Plus,
  Search,
  Settings2,
  X,
} from "lucide-react";
import type { Project } from "./types";

export function ProjectPicker({
  open,
  projects,
  activeId,
  archived,
  busy,
  onOpenChange,
  onSelect,
  onNew,
  onDetails,
  onArchived,
  onExport,
  onImport,
}: {
  open: boolean;
  projects: Project[];
  activeId: string;
  archived: boolean;
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (project: Project) => void;
  onNew: () => void;
  onDetails: () => void;
  onArchived: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null),
    search = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (open) {
      // Reset before the field becomes usable. Native toggle notifications are
      // queued and may arrive after the user has already entered a search.
      setQuery("");
      panel.current?.showPopover();
      search.current?.focus();
    } else panel.current?.hidePopover();
  }, [open]);
  const close = () => {
    onOpenChange(false);
    document
      .querySelector<HTMLButtonElement>(".workspace-project-title")
      ?.focus();
  };
  const action = (callback: () => void) => {
    onOpenChange(false);
    callback();
  };
  const matches = projects.filter((p) =>
    `${p.name} ${p.company} ${p.role}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <div
      ref={panel}
      popover="auto"
      id="project-navigation"
      className="project-picker"
      role="dialog"
      aria-label="Switch project"
      onToggle={(event) => {
        const shown = event.currentTarget.matches(":popover-open");
        if (!shown && open) {
          onOpenChange(false);
          if (
            document.activeElement === document.body ||
            event.currentTarget.contains(document.activeElement)
          )
            document
              .querySelector<HTMLButtonElement>(".workspace-project-title")
              ?.focus();
        }
      }}
    >
      <header className="project-picker-heading">
        <h2>Projects</h2>
        <button
          className="secondary-button"
          disabled={busy}
          onClick={() => action(onNew)}
        >
          <Plus size={15} /> New project
        </button>
        <button
          className="icon-button"
          aria-label="Close project navigation"
          onClick={close}
        >
          <X size={17} />
        </button>
      </header>
      <div className="project-search">
        <Search size={17} />
        <input
          ref={search}
          aria-label="Search projects"
          placeholder="Find a project…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              panel.current
                ?.querySelector<HTMLButtonElement>(".project-link")
                ?.focus();
            }
          }}
        />
      </div>
      <div className="project-list-caption">
        <span>{archived ? "Archived projects" : "Your projects"}</span>
        <button
          className="text-button"
          aria-pressed={archived}
          onClick={onArchived}
        >
          <Archive size={13} />
          {archived ? "View active" : "View archived"}
        </button>
      </div>
      <nav
        className="project-list"
        aria-label={archived ? "Archived projects" : "Projects"}
        onKeyDown={(event) => {
          if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key))
            return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
          );
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (!buttons.length) return;
          event.preventDefault();
          const next =
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? buttons.length - 1
                : (index +
                    (event.key === "ArrowDown" ? 1 : buttons.length - 1)) %
                  buttons.length;
          buttons[next].focus();
        }}
      >
        {matches.map((p) => (
          <button
            className={`project-link ${p.id === activeId ? "selected" : ""}`}
            key={p.id}
            aria-current={p.id === activeId ? "page" : undefined}
            disabled={busy}
            onClick={() => onSelect(p)}
          >
            <Folder size={18} />
            <span className="project-row-copy">
              <strong>{p.name}</strong>
              <small>
                {p.archivedAt
                  ? "Restore project"
                  : [p.company, p.role].filter(Boolean).join(" · ") ||
                    "Python interview practice"}
              </small>
            </span>
            {p.interviewDate && (
              <time dateTime={p.interviewDate}>
                {new Date(`${p.interviewDate}T12:00:00`).toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric" },
                )}
              </time>
            )}
            {p.id === activeId && <Check size={16} />}
          </button>
        ))}
        {!matches.length && (
          <p className="project-list-empty">
            {query ? "No projects match your search." : "No archived projects."}
          </p>
        )}
      </nav>
      <footer className="project-picker-footer">
        <button onClick={() => action(onDetails)}>
          <Settings2 size={15} /> Project details
        </button>
        <div>
          <button onClick={() => action(onImport)} disabled={busy}>
            <ArrowUpFromLine size={15} /> Import backup
          </button>
          <button onClick={onExport}>
            <ArrowDownToLine size={15} /> Export project
          </button>
        </div>
      </footer>
    </div>
  );
}
