import type { Draft } from "./types";

export const MAIN_FILE = "main.py";
export const MAX_MODULE_FILES = 32;
export const MAX_PROJECT_BYTES = 1024 * 1024;
export const MAX_FILE_PATH_LENGTH = 180;
const encoder = new TextEncoder();
const keywords = new Set("False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield".split(" "));

/** Validate an extra module path, never the canonical main.py entrypoint. */
export function validateFilePath(path: string): string | null {
  if (path === MAIN_FILE) return "main.py is the entrypoint and already exists.";
  if (!path || path.length > MAX_FILE_PATH_LENGTH) return `Use a file path between 1 and ${MAX_FILE_PATH_LENGTH} characters.`;
  if (!path.endsWith(".py")) return "Python files must end in .py.";
  const segments = path.slice(0, -3).split("/");
  if (segments.length > 8 || segments.some((segment) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(segment) || keywords.has(segment))) {
    return "Use Python module names such as helpers.py or package/helpers.py; no spaces, keywords, or parent paths.";
  }
  return null;
}

/** Shared boundary validation for saved sessions, file actions, and worker requests. */
export function validateProjectFiles(files: unknown, source = "", options: { enforceLimits?: boolean } = {}): string | null {
  if (files !== undefined && (typeof files !== "object" || files === null || Array.isArray(files))) return "Project files must be a map of Python paths to source code.";
  const entries = Object.entries(files ?? {});
  const enforceLimits = options.enforceLimits !== false;
  if (enforceLimits && entries.length > MAX_MODULE_FILES) return `A project can contain up to ${MAX_MODULE_FILES} additional Python files.`;
  let bytes = enforceLimits ? encoder.encode(source).byteLength : 0;
  const paths = new Set(entries.map(([path]) => path));
  for (const [path, content] of entries) {
    const error = validateFilePath(path);
    if (error) return `${path}: ${error}`;
    if (typeof content !== "string") return `${path}: source code must be text.`;
    if (enforceLimits) bytes += encoder.encode(content).byteLength;
    // Python cannot have both a module and a same-named package. Avoid imports
    // silently selecting a different file than the one visible in the editor.
    const segments = path.split("/");
    for (let depth = 1; depth < segments.length; depth++) {
      const modulePath = `${segments.slice(0, depth).join("/")}.py`;
      if (paths.has(modulePath) || modulePath === MAIN_FILE) return `A module and package cannot share the name ${modulePath.slice(0, -3)}.`;
    }
  }
  if (enforceLimits && bytes > MAX_PROJECT_BYTES) return "The combined Python source must be 1 MiB or smaller.";
  return null;
}

export function listFiles(draft: Pick<Draft, "files">): string[] {
  return [MAIN_FILE, ...Object.keys(draft.files ?? {}).sort()];
}

export function getActiveFile(draft: Pick<Draft, "files" | "activeFile">): string {
  return draft.activeFile && Object.hasOwn(draft.files ?? {}, draft.activeFile)
    ? draft.activeFile
    : MAIN_FILE;
}

export function getFileSource(draft: Pick<Draft, "source" | "files">, path: string): string {
  return path === MAIN_FILE ? draft.source : Object.hasOwn(draft.files ?? {}, path) ? draft.files![path] : "";
}

/** Return an immutable draft update; callers validate limits when adding/running. */
export function withFileSource(draft: Draft, path: string, source: string): Draft {
  if (path === MAIN_FILE) return { ...draft, source };
  const error = validateFilePath(path);
  if (error) throw new Error(error);
  return { ...draft, files: { ...draft.files, [path]: source } };
}
