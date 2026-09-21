import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent } from "react";
import {
  Check,
  ChevronRight,
  ListCollapse,
  FileCode2,
  FilePlus2,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { MAX_FILE_PATH_LENGTH, validateFilePath } from "./files";

export interface WorkspaceFilesProps {
  files: Record<string, string>;
  activeFile: string;
  onSelect: (path: string) => void;
  onCreate: (path: string) => string | null;
  onRename: (oldPath: string, newPath: string) => string | null;
  onDelete: (path: string) => string | null;
  disabled?: boolean;
  workspaceName?: string;
}

interface FileNode {
  path: string;
  name: string;
  parent: string | null;
  depth: number;
  folder: boolean;
  children: FileNode[];
}

function makeTree(paths: string[]): FileNode[] {
  const roots: FileNode[] = [];
  const folders = new Map<string, FileNode>();
  for (const path of paths) {
    const parts = path.split("/");
    let parent: FileNode | undefined;
    for (let index = 0; index < parts.length; index++) {
      const nodePath = parts.slice(0, index + 1).join("/");
      const folder = index < parts.length - 1;
      let node = folder ? folders.get(nodePath) : undefined;
      if (!node) {
        node = {
          path: nodePath,
          name: parts[index],
          parent: parent?.path ?? null,
          depth: index + 1,
          folder,
          children: [],
        };
        (parent?.children ?? roots).push(node);
        if (folder) folders.set(nodePath, node);
      }
      parent = node;
    }
  }
  function sort(nodes: FileNode[]): FileNode[] {
    nodes.sort((a, b) => {
      if (a.folder !== b.folder) return a.folder ? -1 : 1;
      if (a.path === "main.py") return -1;
      if (b.path === "main.py") return 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((node) => sort(node.children));
    return nodes;
  }
  return sort(roots);
}

function parents(path: string): string[] {
  const parts = path.split("/");
  return parts
    .slice(0, -1)
    .map((_, index) => parts.slice(0, index + 1).join("/"));
}

export function WorkspaceFiles({
  files,
  activeFile,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  disabled = false,
  workspaceName = "Workspace",
}: WorkspaceFilesProps) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [rootCollapsed, setRootCollapsed] = useState(false);
  const [focusedPath, setFocusedPath] = useState(activeFile);
  const [form, setForm] = useState<{
    kind: "create" | "rename";
    original?: string;
    parent: string | null;
  } | null>(null);
  const [pathValue, setPathValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const itemRefs = useRef(new Map<string, HTMLDivElement>());
  const inputRef = useRef<HTMLInputElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const newRef = useRef<HTMLButtonElement>(null);
  // undefined: no request; null: return to the New file button.
  const focusAfterCommit = useRef<string | null | undefined>(undefined);
  const paths = Object.keys(files);
  const pathsKey = paths.join("\0");
  const tree = useMemo(() => makeTree(paths), [pathsKey]);
  const visible = useMemo(() => {
    const list: FileNode[] = [];
    function visit(nodes: FileNode[]) {
      for (const node of nodes) {
        list.push(node);
        if (node.folder && !collapsed.has(node.path)) visit(node.children);
      }
    }
    visit(tree);
    return list;
  }, [tree, collapsed]);
  const tabStop = visible.some((node) => node.path === focusedPath)
    ? focusedPath
    : visible.some((node) => node.path === activeFile)
      ? activeFile
      : visible[0]?.path;

  useEffect(() => {
    setRootCollapsed(false);
    setFocusedPath(activeFile);
    setCollapsed((current) => {
      const next = new Set(current);
      parents(activeFile).forEach((path) => next.delete(path));
      return next;
    });
  }, [activeFile]);
  useLayoutEffect(() => {
    if (form) {
      inputRef.current?.focus();
      const input = inputRef.current;
      if (input) {
        const start =
          form.kind === "create"
            ? input.value.length
            : input.value.lastIndexOf("/") + 1;
        const end = form.kind === "create" ? start : input.value.length - 3;
        input.setSelectionRange(start, Math.max(start, end));
      }
    }
  }, [form]);
  useLayoutEffect(() => {
    if (pendingDelete) deleteRef.current?.focus();
  }, [pendingDelete]);
  useLayoutEffect(() => {
    const path = focusAfterCommit.current;
    focusAfterCommit.current = undefined;
    if (path === undefined || form || pendingDelete) return;
    // Restore focus once the new tree exists, before another user action can
    // open an input. A delayed animation callback can steal that input's focus.
    if (path && itemRefs.current.has(path)) focusPath(path);
    else newRef.current?.focus();
  });
  useEffect(() => {
    if (
      form?.kind === "rename" &&
      form.original &&
      !Object.hasOwn(files, form.original)
    ) {
      setForm(null);
      setError(
        "That file is no longer in the workspace. Select a file to continue.",
      );
    }
    if (pendingDelete && !Object.hasOwn(files, pendingDelete))
      setPendingDelete(null);
  }, [pathsKey]);

  function focusPath(path: string) {
    setFocusedPath(path);
    itemRefs.current.get(path)?.focus({ preventScroll: true });
    itemRefs.current
      .get(path)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function toggleFolder(path: string, close?: boolean) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (close ?? !current.has(path)) next.add(path);
      else next.delete(path);
      return next;
    });
  }

  function beginCreate() {
    if (disabled) return;
    focusAfterCommit.current = undefined;
    setError("");
    setAnnouncement("");
    setPendingDelete(null);
    const focused = visible.find((node) => node.path === focusedPath);
    const parent = focused?.folder ? focused.path : (focused?.parent ?? null);
    setRootCollapsed(false);
    if (parent) toggleFolder(parent, false);
    setPathValue(parent ? `${parent}/` : "");
    setForm({ kind: "create", parent });
  }

  function beginRename(path: string) {
    if (disabled || path === "main.py") return;
    focusAfterCommit.current = undefined;
    setError("");
    setAnnouncement("");
    setPendingDelete(null);
    setPathValue(path);
    setForm({
      kind: "rename",
      original: path,
      parent: parents(path).at(-1) ?? null,
    });
  }

  function beginDelete(path: string) {
    if (disabled || path === "main.py") return;
    focusAfterCommit.current = undefined;
    setForm(null);
    setError("");
    setAnnouncement("");
    setPendingDelete(path);
  }

  function cancelForm() {
    const returnPath = form?.original ?? form?.parent;
    setForm(null);
    setError("");
    focusAfterCommit.current = returnPath ?? null;
  }

  function submitFile() {
    if (!form || disabled) return;
    const path = pathValue.trim();
    if (!path) {
      setError("Enter a Python file path, such as helpers.py.");
      return;
    }
    const invalid = validateFilePath(path);
    if (invalid) {
      setError(invalid);
      return;
    }
    try {
      const failure =
        form.kind === "create"
          ? onCreate(path)
          : onRename(form.original!, path);
      if (failure) {
        setError(failure);
        return;
      }
      setForm(null);
      setError("");
      setAnnouncement(
        form.kind === "create"
          ? `Created ${path}.`
          : `Renamed ${form.original} to ${path}.`,
      );
      setCollapsed((current) => {
        const next = new Set(current);
        parents(path).forEach((parent) => next.delete(parent));
        return next;
      });
      focusAfterCommit.current = path;
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not save this file. Try another path.",
      );
    }
  }

  function deleteFile() {
    if (!pendingDelete || disabled) return;
    try {
      const failure = onDelete(pendingDelete);
      if (failure) {
        setError(failure);
        return;
      }
      setAnnouncement(`Deleted ${pendingDelete}.`);
      setPendingDelete(null);
      setError("");
      setRootCollapsed(false);
      focusAfterCommit.current = "main.py";
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : "Could not delete this file. Try again.",
      );
    }
  }

  function onTreeKey(event: KeyboardEvent<HTMLDivElement>, node: FileNode) {
    if (event.target !== event.currentTarget || disabled) return;
    const index = visible.findIndex((item) => item.path === node.path);
    let destination: string | undefined;
    switch (event.key) {
      case "Enter":
      case " ":
        node.folder ? toggleFolder(node.path) : onSelect(node.path);
        break;
      case "ArrowDown":
        destination = visible[Math.min(index + 1, visible.length - 1)]?.path;
        break;
      case "ArrowUp":
        destination = visible[Math.max(0, index - 1)]?.path;
        break;
      case "Home":
        destination = visible[0]?.path;
        break;
      case "End":
        destination = visible[visible.length - 1]?.path;
        break;
      case "ArrowRight":
        if (node.folder && collapsed.has(node.path))
          toggleFolder(node.path, false);
        else if (node.folder) destination = node.children[0]?.path;
        break;
      case "ArrowLeft":
        if (node.folder && !collapsed.has(node.path))
          toggleFolder(node.path, true);
        else destination = node.parent ?? undefined;
        break;
      case "F2":
        if (!node.folder) beginRename(node.path);
        break;
      case "Delete":
        if (!node.folder) beginDelete(node.path);
        break;
      default:
        return;
    }
    event.preventDefault();
    if (destination) focusPath(destination);
  }

  function collapseFolders() {
    const folders = new Set<string>();
    function visit(nodes: FileNode[]) {
      for (const node of nodes) {
        if (node.folder) {
          folders.add(node.path);
          visit(node.children);
        }
      }
    }
    visit(tree);
    setCollapsed(folders);
    const top = focusedPath.split("/")[0];
    setFocusedPath(top);
  }

  function renderEdit(depth: number) {
    if (!form) return null;
    return (
      <form
        className="workspace-file-form file-inline-form"
        style={{ paddingLeft: `${28 + (depth - 1) * 16}px` }}
        aria-label={
          form.kind === "create" ? "New Python file" : "Rename Python file"
        }
        onClick={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          submitFile();
        }}
      >
        <div className="file-inline-input">
          <FileCode2 size={15} className="file-type-icon" aria-hidden="true" />
          <label className="workspace-sr-only" htmlFor="workspace-file-path">
            File path
          </label>
          <input
            ref={inputRef}
            id="workspace-file-path"
            value={pathValue}
            onChange={(event) => {
              setPathValue(event.target.value);
              setError("");
            }}
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.key === "Escape") {
                event.preventDefault();
                cancelForm();
              }
            }}
            placeholder="helpers.py"
            maxLength={MAX_FILE_PATH_LENGTH}
            disabled={disabled}
            spellCheck={false}
            autoComplete="off"
            aria-invalid={!!error}
            aria-describedby={error ? "file-action-error" : "file-path-help"}
          />
          <button
            className="icon-button"
            type="submit"
            disabled={disabled}
            aria-label={form.kind === "create" ? "Create file" : "Save name"}
            title={
              form.kind === "create"
                ? "Create file (Enter)"
                : "Save name (Enter)"
            }
          >
            <Check size={14} />
          </button>
          <button
            className="icon-button"
            type="button"
            aria-label="Cancel file edit"
            title="Cancel file edit (Escape)"
            onClick={cancelForm}
          >
            <X size={14} />
          </button>
        </div>
        {error ? (
          <p id="file-action-error" className="file-action-error" role="alert">
            {error}
          </p>
        ) : (
          <p id="file-path-help">
            Use / for folders. Enter to save; Esc to cancel.
          </p>
        )}
      </form>
    );
  }

  return (
    <section className="workspace-files" aria-label="Workspace files">
      <div className="files-toolbar">
        <h2>Explorer</h2>
        <div className="explorer-header-actions">
          <button
            ref={newRef}
            className="icon-button new-file-button"
            disabled={disabled}
            aria-label="New file"
            title="New file"
            onClick={beginCreate}
          >
            <FilePlus2 size={16} />
          </button>
          <button
            className="icon-button"
            disabled={
              disabled || !!form || !paths.some((path) => path.includes("/"))
            }
            aria-label="Collapse folders"
            title="Collapse folders"
            onClick={collapseFolders}
          >
            <ListCollapse size={16} />
          </button>
        </div>
      </div>
      <button
        type="button"
        className="workspace-root-toggle"
        aria-expanded={!rootCollapsed}
        aria-controls="workspace-file-tree"
        aria-label={`${rootCollapsed ? "Expand" : "Collapse"} workspace files`}
        disabled={!!form}
        onClick={() => setRootCollapsed((current) => !current)}
        title={workspaceName}
      >
        <ChevronRight
          size={14}
          className={`file-chevron ${rootCollapsed ? "" : "open"}`}
        />
        <span>{workspaceName}</span>
        <small>{paths.length}</small>
      </button>
      <p id="file-tree-help" className="workspace-sr-only">
        Use arrow keys to explore folders, Enter to open a file, F2 to rename,
        and Delete to remove a module. main.py is the fixed entry point.
      </p>
      <div
        id="workspace-file-tree"
        className="file-tree"
        role="tree"
        aria-label="Python files"
        aria-describedby="file-tree-help"
        hidden={rootCollapsed}
      >
        {form?.kind === "create" && !form.parent && (
          <div
            role="treeitem"
            aria-label="New Python file"
            aria-level={1}
            className="file-edit-treeitem"
          >
            {renderEdit(1)}
          </div>
        )}
        {visible.map((node) => {
          const open = node.folder && !collapsed.has(node.path);
          const isEntry = node.path === "main.py";
          const editing =
            form?.kind === "rename" && form.original === node.path;
          const Icon = node.folder ? (open ? FolderOpen : Folder) : FileCode2;
          const siblings = visible.filter(
            (sibling) => sibling.parent === node.parent,
          );
          return (
            <Fragment key={node.path}>
              <div
                role="treeitem"
                ref={(element) => {
                  if (element) itemRefs.current.set(node.path, element);
                  else itemRefs.current.delete(node.path);
                }}
                aria-label={node.path}
                aria-description={
                  isEntry ? "Python entry point; always runs first" : undefined
                }
                aria-level={node.depth}
                aria-posinset={
                  siblings.findIndex((sibling) => sibling.path === node.path) +
                  1
                }
                aria-setsize={siblings.length}
                aria-expanded={node.folder ? open : undefined}
                aria-selected={
                  node.folder ? undefined : node.path === activeFile
                }
                aria-disabled={disabled || undefined}
                className={`file-tree-item ${node.folder ? "file-folder" : ""} ${node.path === activeFile ? "selected" : ""} ${editing ? "file-is-editing" : ""}`}
                style={{
                  paddingLeft: editing ? 0 : `${12 + (node.depth - 1) * 16}px`,
                }}
                tabIndex={
                  !editing && !disabled && node.path === tabStop ? 0 : -1
                }
                title={editing ? undefined : node.path}
                onFocus={(event) => {
                  if (event.target === event.currentTarget)
                    setFocusedPath(node.path);
                }}
                onKeyDown={(event) => onTreeKey(event, node)}
                onClick={() => {
                  if (disabled || editing) return;
                  setFocusedPath(node.path);
                  node.folder ? toggleFolder(node.path) : onSelect(node.path);
                }}
              >
                {editing ? (
                  renderEdit(node.depth)
                ) : (
                  <>
                    {Array.from({ length: node.depth - 1 }, (_, index) => (
                      <span
                        key={index}
                        className="file-indent-guide"
                        style={{ left: `${18 + index * 16}px` }}
                        aria-hidden="true"
                      />
                    ))}
                    {node.folder ? (
                      <ChevronRight
                        size={13}
                        className={`file-chevron ${open ? "open" : ""}`}
                        aria-hidden="true"
                      />
                    ) : (
                      <span className="file-tree-spacer" aria-hidden="true" />
                    )}
                    <Icon
                      size={15}
                      className="file-type-icon"
                      aria-hidden="true"
                    />
                    <span className="file-name">{node.name}</span>
                    {isEntry && (
                      <span className="entry-label" aria-hidden="true">
                        entry
                      </span>
                    )}
                    {!node.folder && !isEntry && (
                      <div
                        className="file-row-actions"
                        onClick={(event) => event.stopPropagation()}
                      >
                        <button
                          className="icon-button"
                          disabled={disabled}
                          title="Rename file (F2)"
                          aria-label={`Rename ${node.path}`}
                          onClick={() => beginRename(node.path)}
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={disabled}
                          title="Delete file"
                          aria-label={`Delete ${node.path}`}
                          onClick={() => beginDelete(node.path)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
              {form?.kind === "create" && form.parent === node.path && (
                <div
                  role="treeitem"
                  aria-label="New Python file"
                  aria-level={node.depth + 1}
                  className="file-edit-treeitem"
                >
                  {renderEdit(node.depth + 1)}
                </div>
              )}
            </Fragment>
          );
        })}
      </div>
      {pendingDelete && (
        <div
          className="file-delete-confirm"
          role="group"
          aria-label="Confirm file deletion"
        >
          <strong>
            Delete <span>{pendingDelete}</span>?
          </strong>
          <p>This removes the file and its code from this workspace.</p>
          <div>
            <button
              className="secondary-button"
              disabled={disabled}
              onClick={() => {
                const path = pendingDelete;
                setPendingDelete(null);
                setError("");
                focusAfterCommit.current = path;
              }}
            >
              Keep file
            </button>
            <button
              ref={deleteRef}
              className="stop-button"
              disabled={disabled}
              onClick={deleteFile}
            >
              <Trash2 size={13} />
              Delete file
            </button>
          </div>
        </div>
      )}
      {error && !form && (
        <p id="file-action-error" className="file-action-error" role="alert">
          {error}
        </p>
      )}
      <p className="file-action-feedback workspace-sr-only" role="status">
        {announcement}
      </p>
      <div className="explorer-footer">
        <span>Run entry point</span>
        <code>main.py</code>
      </div>
    </section>
  );
}

export interface EditorFileTabsProps extends Pick<
  WorkspaceFilesProps,
  "files" | "activeFile" | "onSelect" | "disabled"
> {
  editorPanelId?: string;
}

export function EditorFileTabs({
  files,
  activeFile,
  onSelect,
  disabled = false,
  editorPanelId,
}: EditorFileTabsProps) {
  const container = useRef<HTMLDivElement>(null);
  const paths = Object.keys(files).sort((a, b) =>
    a === "main.py" ? -1 : b === "main.py" ? 1 : a.localeCompare(b),
  );
  useEffect(() => {
    container.current
      ?.querySelector<HTMLButtonElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeFile]);
  return (
    <div
      className="editor-file-tabs"
      role="tablist"
      aria-label="Open files"
      ref={container}
      onKeyDown={(event) => {
        const current = Math.max(0, paths.indexOf(activeFile));
        const index =
          event.key === "ArrowRight"
            ? (current + 1) % paths.length
            : event.key === "ArrowLeft"
              ? (current + paths.length - 1) % paths.length
              : event.key === "Home"
                ? 0
                : event.key === "End"
                  ? paths.length - 1
                  : -1;
        if (index < 0 || disabled || !paths.length) return;
        event.preventDefault();
        onSelect(paths[index]);
        container.current
          ?.querySelectorAll<HTMLButtonElement>('button[role="tab"]')
          [index]?.focus();
      }}
    >
      {paths.map((path) => (
        <button
          key={path}
          id={`editor-file-${encodeURIComponent(path)}`}
          className={`editor-file-tab ${path === activeFile ? "active" : ""}`}
          role="tab"
          type="button"
          aria-label={path}
          aria-description={
            path === "main.py" ? "Python entry point" : undefined
          }
          aria-selected={path === activeFile}
          aria-controls={editorPanelId}
          tabIndex={path === activeFile ? 0 : -1}
          disabled={disabled}
          title={path === "main.py" ? "main.py · Python entry point" : path}
          onClick={() => onSelect(path)}
        >
          <FileCode2 size={14} />
          <span>{path.split("/").at(-1)}</span>
          {paths.some(
            (other) =>
              other !== path &&
              other.split("/").at(-1) === path.split("/").at(-1),
          ) && (
            <small aria-hidden="true">
              {path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "."}
            </small>
          )}
        </button>
      ))}
    </div>
  );
}

export default WorkspaceFiles;
