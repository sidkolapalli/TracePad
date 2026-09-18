import { useEffect, useRef, useState } from "react";
import {
  Copy,
  ChevronLeft,
  ChevronRight,
  Download,
  GitBranch,
  Maximize2,
  Minimize2,
  Plus,
  Redo2,
  RotateCcw,
  StickyNote,
  Table2,
  Trash2,
  Undo2,
} from "lucide-react";
import { FlowCanvas } from "./FlowCanvas";
import {
  defaultScratchpad,
  type Scratchpad as ScratchpadData,
  type TraceTable,
} from "./model";

const tabs = ["notes", "trace", "flow"] as const;
const uid = () => crypto.randomUUID();

function TraceEditor({
  value,
  onChange,
  disabled,
}: {
  value: TraceTable;
  onChange: (next: TraceTable, group?: string) => void;
  disabled: boolean;
}) {
  const table = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ left: false, right: false });
  const measure = () => {
    const element = table.current;
    if (element)
      setOverflow({
        left: element.scrollLeft > 2,
        right:
          element.scrollWidth - element.clientWidth - element.scrollLeft > 2,
      });
  };
  useEffect(() => {
    const observer = new ResizeObserver(measure);
    if (table.current) observer.observe(table.current);
    measure();
    return () => observer.disconnect();
  }, [value.columns.length]);
  const addRow = (copy?: TraceTable["rows"][number]) => {
    if (value.rows.length >= 100) return;
    const id = uid();
    onChange({
      ...value,
      rows: [...value.rows, { id, cells: copy ? { ...copy.cells } : {} }],
    });
    requestAnimationFrame(() =>
      table.current
        ?.querySelector<HTMLTextAreaElement>(`[data-row="${id}"] textarea`)
        ?.focus(),
    );
  };
  return (
    <div className="trace-editor">
      <div className="trace-actions">
        <button
          className="secondary-button"
          disabled={disabled || value.rows.length >= 100}
          onClick={() => addRow()}
        >
          <Plus size={14} /> Add row
        </button>
        <button
          className="secondary-button"
          disabled={disabled || value.columns.length >= 12}
          onClick={() => {
            const id = uid();
            onChange({
              ...value,
              columns: [
                ...value.columns,
                { id, name: `Variable ${value.columns.length - 1}` },
              ],
            });
            requestAnimationFrame(() =>
              table.current
                ?.querySelector<HTMLInputElement>(`[data-column="${id}"] input`)
                ?.focus(),
            );
          }}
        >
          <Plus size={14} /> Add column
        </button>
        <span>{value.rows.length}/100 rows</span>
      </div>
      <p className="scratchpad-help">
        Track values by hand, one step at a time. Rename the columns for your
        variables.
      </p>
      <div
        ref={table}
        className="trace-scroll"
        role="region"
        aria-label="Editable trace table"
        tabIndex={0}
        onScroll={measure}
      >
        <table className="trace-table">
          <caption className="sr-only">
            Manual execution trace. Tab moves between cells. Enter adds a line
            inside a cell.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="trace-index">
                #
              </th>
              {value.columns.map((column, index) => (
                <th scope="col" key={column.id} data-column={column.id}>
                  <div>
                    <input
                      aria-label={`Column ${index + 1} name`}
                      value={column.name}
                      maxLength={80}
                      disabled={disabled}
                      onChange={(event) =>
                        onChange(
                          {
                            ...value,
                            columns: value.columns.map((c) =>
                              c.id === column.id
                                ? { ...c, name: event.target.value }
                                : c,
                            ),
                          },
                          `column:${column.id}`,
                        )
                      }
                    />
                    <button
                      className="icon-button"
                      title={`Remove column ${index + 1}`}
                      aria-label={`Remove column ${index + 1}`}
                      disabled={disabled || value.columns.length === 1}
                      onClick={() =>
                        onChange({
                          columns: value.columns.filter(
                            (c) => c.id !== column.id,
                          ),
                          rows: value.rows.map((row) => ({
                            id: row.id,
                            cells: Object.fromEntries(
                              Object.entries(row.cells).filter(
                                ([key]) => key !== column.id,
                              ),
                            ),
                          })),
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </th>
              ))}
              <th scope="col" className="trace-row-actions">
                <span className="sr-only">Row actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {value.rows.map((row, index) => (
              <tr key={row.id} data-row={row.id}>
                <th scope="row" className="trace-index">
                  {index + 1}
                </th>
                {value.columns.map((column) => (
                  <td key={column.id}>
                    <textarea
                      rows={2}
                      aria-label={`Row ${index + 1}, ${column.name || "unnamed column"}`}
                      spellCheck={false}
                      maxLength={2000}
                      disabled={disabled}
                      value={row.cells[column.id] ?? ""}
                      onChange={(event) =>
                        onChange(
                          {
                            ...value,
                            rows: value.rows.map((r) =>
                              r.id === row.id
                                ? {
                                    ...r,
                                    cells: {
                                      ...r.cells,
                                      [column.id]: event.target.value,
                                    },
                                  }
                                : r,
                            ),
                          },
                          `cell:${row.id}:${column.id}`,
                        )
                      }
                    />
                  </td>
                ))}
                <td className="trace-row-actions">
                  <button
                    className="icon-button"
                    title={`Duplicate row ${index + 1}`}
                    aria-label={`Duplicate row ${index + 1}`}
                    disabled={disabled || value.rows.length >= 100}
                    onClick={() => addRow(row)}
                  >
                    <Copy size={13} />
                  </button>
                  <button
                    className="icon-button"
                    title={`Remove row ${index + 1}`}
                    aria-label={`Remove row ${index + 1}`}
                    disabled={disabled}
                    onClick={() =>
                      onChange({
                        ...value,
                        rows: value.rows.filter((r) => r.id !== row.id),
                      })
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!value.rows.length && (
          <div className="trace-empty">
            <Table2 size={22} />
            <p>Start with your input, then record what changes.</p>
            <button
              className="secondary-button"
              disabled={disabled}
              onClick={() => addRow()}
            >
              Add the first row
            </button>
          </div>
        )}
      </div>
      <div className="trace-footer">
        <p className="scratchpad-footnote">Manual trace</p>
        {(overflow.left || overflow.right) && (
          <div className="trace-overflow-controls">
            <span>More columns</span>
            <button
              className="icon-button"
              aria-label="Scroll columns left"
              disabled={!overflow.left}
              onClick={() => table.current?.scrollBy({ left: -180 })}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              className="icon-button"
              aria-label="Scroll columns right"
              disabled={!overflow.right}
              onClick={() => table.current?.scrollBy({ left: 180 })}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Scratchpad({
  value,
  onChange,
  title,
  expanded,
  onExpand,
  disabled = false,
}: {
  value?: ScratchpadData;
  onChange: (next: ScratchpadData) => void;
  title: string;
  expanded: boolean;
  onExpand: () => void;
  disabled?: boolean;
}) {
  const fallback = useRef(defaultScratchpad());
  const current = value ?? fallback.current;
  const history = useRef<{ past: ScratchpadData[]; future: ScratchpadData[] }>({
    past: [],
    future: [],
  });
  const [, redraw] = useState(0);
  const lastEdit = useRef<{ kind: string; at: number }>({ kind: "", at: 0 });
  const update = (next: ScratchpadData, kind = "structure") => {
    if (disabled || JSON.stringify(next) === JSON.stringify(current)) return;
    const now = Date.now();
    // Consecutive typing is one undo step; diagram actions and row operations are discrete.
    if (
      !kind.startsWith("typing:") ||
      lastEdit.current.kind !== kind ||
      now - lastEdit.current.at > 900
    ) {
      history.current.past.push(structuredClone(current));
      if (history.current.past.length > 50) history.current.past.shift();
    }
    history.current.future = [];
    lastEdit.current = { kind, at: now };
    onChange(next);
  };
  const undo = (redo = false) => {
    if (disabled) return;
    const from = redo ? history.current.future : history.current.past;
    const to = redo ? history.current.past : history.current.future;
    const next = from.pop();
    if (!next) return;
    to.push(structuredClone(current));
    lastEdit.current = { kind: "", at: 0 };
    onChange(next);
    redraw((n) => n + 1);
  };
  const setTab = (next: ScratchpadData["activeTab"]) => {
    lastEdit.current = { kind: "", at: 0 };
    onChange({ ...current, activeTab: next });
  };
  const exportJSON = () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              format: "localpad-scratchpad",
              version: 1,
              question: title,
              scratchpad: current,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `${title.replace(/[^a-z0-9]+/gi, "-").slice(0, 70) || "question"}-scratchpad.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div
      className="scratchpad"
      onKeyDown={(event) => {
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "z" &&
          !(event.target as HTMLElement).closest("input,textarea,select")
        ) {
          event.preventDefault();
          undo(event.shiftKey);
        }
      }}
    >
      <header className="scratchpad-heading">
        <h2 title={title}>{title}</h2>
        <button
          className="icon-button scratchpad-expand"
          aria-label={
            expanded ? "Return to split workspace" : "Expand scratchpad"
          }
          title={expanded ? "Return to split workspace" : "Expand scratchpad"}
          onClick={onExpand}
        >
          {expanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </button>
      </header>
      <div className="scratchpad-navigation">
        <div
          role="tablist"
          aria-label="Scratchpad tools"
          onKeyDown={(event) => {
            const index = tabs.indexOf(current.activeTab);
            const next =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? 2
                  : event.key === "ArrowRight"
                    ? (index + 1) % 3
                    : event.key === "ArrowLeft"
                      ? (index + 2) % 3
                      : -1;
            if (next < 0) return;
            event.preventDefault();
            setTab(tabs[next]);
            document.getElementById(`scratch-${tabs[next]}`)?.focus();
          }}
        >
          {(
            [
              ["notes", "Notes", StickyNote],
              ["trace", "Trace table", Table2],
              ["flow", "Flowchart", GitBranch],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              id={`scratch-${id}`}
              role="tab"
              aria-selected={current.activeTab === id}
              aria-controls={`scratch-panel-${id}`}
              tabIndex={current.activeTab === id ? 0 : -1}
              onClick={() => setTab(id)}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>
        <div className="scratchpad-history">
          <button
            className="icon-button"
            aria-label="Undo scratchpad edit"
            title="Undo scratchpad edit"
            disabled={disabled || !history.current.past.length}
            onClick={() => undo()}
          >
            <Undo2 size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Redo scratchpad edit"
            title="Redo scratchpad edit"
            disabled={disabled || !history.current.future.length}
            onClick={() => undo(true)}
          >
            <Redo2 size={15} />
          </button>
        </div>
      </div>
      <div className="scratchpad-content">
        {current.activeTab === "notes" && (
          <section
            role="tabpanel"
            id="scratch-panel-notes"
            aria-labelledby="scratch-notes"
            className="scratch-notes"
          >
            <label className="sr-only" htmlFor="scratch-notes-input">
              Scratchpad notes
            </label>
            <textarea
              id="scratch-notes-input"
              disabled={disabled}
              maxLength={50000}
              value={current.notes}
              onChange={(event) =>
                update(
                  { ...current, notes: event.target.value },
                  "typing:notes",
                )
              }
              placeholder={
                "What do I know?\nWhat should happen for an empty input?\nHow will I explain my approach?"
              }
            />
            <span className="scratchpad-footnote">
              Plain text · {current.notes.length.toLocaleString()}/50,000
              characters
            </span>
          </section>
        )}
        {current.activeTab === "trace" && (
          <section
            role="tabpanel"
            id="scratch-panel-trace"
            aria-labelledby="scratch-trace"
          >
            <TraceEditor
              value={current.trace}
              disabled={disabled}
              onChange={(trace, group) =>
                update(
                  { ...current, trace },
                  group ? `typing:${group}` : "structure",
                )
              }
            />
          </section>
        )}
        {current.activeTab === "flow" && (
          <section
            role="tabpanel"
            id="scratch-panel-flow"
            aria-labelledby="scratch-flow"
          >
            <FlowCanvas
              value={current.flow}
              disabled={disabled}
              onChange={(flow) => update({ ...current, flow })}
            />
          </section>
        )}
      </div>
      <footer className="scratchpad-footer">
        <span>Saved with this question</span>
        <div>
          <button
            title="Export scratchpad JSON"
            aria-label="Export scratchpad JSON"
            onClick={exportJSON}
          >
            <Download size={14} />
            <span>Export</span>
          </button>
          <button
            title="Clear current scratchpad tool"
            aria-label="Clear current scratchpad tool"
            disabled={disabled}
            onClick={() => {
              if (
                !window.confirm(
                  `Clear this ${current.activeTab === "notes" ? "note" : current.activeTab === "trace" ? "trace table" : "flowchart"}? You can undo this change.`,
                )
              )
                return;
              const empty = defaultScratchpad();
              update({
                ...current,
                [current.activeTab === "notes"
                  ? "notes"
                  : current.activeTab === "trace"
                    ? "trace"
                    : "flow"]:
                  empty[
                    current.activeTab === "notes"
                      ? "notes"
                      : current.activeTab === "trace"
                        ? "trace"
                        : "flow"
                  ],
              });
            }}
          >
            <RotateCcw size={13} />
            <span>Clear</span>
          </button>
        </div>
      </footer>
    </div>
  );
}
