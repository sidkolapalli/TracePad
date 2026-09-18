import type { PyodideInterface } from "pyodide";
import type { RunRequest, RunnerEvent } from "./types";
import { validateProjectFiles } from "./files";

const OUTPUT_LIMIT = 100 * 1024;
const scope = self as unknown as {
  location: Location;
  onmessage: ((event: MessageEvent<RunRequest>) => void) | null;
  postMessage: (event: RunnerEvent) => void;
};

// The bootstrap function keeps its own references; each invocation gets a new
// globals dictionary and a new stdin stream, including when a previous test fails.
const HARNESS = `
import sys as _sys
import io as _io
import traceback as _traceback
import os as _os
import shutil as _shutil
import json as _json
import importlib as _importlib
import linecache as _linecache
import types as _types

def _make_practice_executor():
    stdout, stderr = _sys.stdout, _sys.stderr
    stdout.reconfigure(line_buffering=True, write_through=True)
    stderr.reconfigure(line_buffering=True, write_through=True)
    compile_code, execute = compile, exec
    new_input = _io.StringIO
    format_error = _traceback.format_exception
    open_file, parse_files = open, _json.loads
    change_directory, make_directories = _os.chdir, _os.makedirs
    remove_directory, remove_file = _shutil.rmtree, _os.unlink
    path_exists, is_link = _os.path.exists, _os.path.islink
    baseline_modules = dict(_sys.modules)
    baseline_path = list(_sys.path)
    baseline_meta_path, baseline_path_hooks = list(_sys.meta_path), list(_sys.path_hooks)
    module_table = _sys.modules
    root = "/localpad_project"

    def run(source, test, stdin, files_json="{}"):
        _sys.stdout, _sys.stderr = stdout, stderr
        _sys.stdin = new_input(stdin)
        try:
            files = parse_files(files_json)
            # Undo additions, removals and replacements in sys.modules. Project
            # modules are imported again, including their package initializers.
            _sys.modules = module_table
            module_table.clear()
            module_table.update(baseline_modules)
            project_roots = {path.split("/")[0].removesuffix(".py") for path in files}
            for name in list(module_table):
                if name.split(".")[0] in project_roots:
                    del module_table[name]
            _sys.path = [root] + baseline_path
            _sys.meta_path = list(baseline_meta_path)
            _sys.path_hooks = list(baseline_path_hooks)
            _sys.path_importer_cache.clear()
            _sys.dont_write_bytecode = True
            _importlib.invalidate_caches()
            _linecache.clearcache()
            change_directory("/")
            if is_link(root):
                remove_file(root)
            elif path_exists(root):
                remove_directory(root)
            make_directories(root)
            files["main.py"] = source
            for path, contents in files.items():
                filename = root + "/" + path
                make_directories(filename.rsplit("/", 1)[0], exist_ok=True)
                with open_file(filename, "w", encoding="utf-8") as handle:
                    handle.write(contents)
            change_directory(root)
            # File creation may import an encoding before the directory exists;
            # clear any negative finder entries after materializing the project.
            _importlib.invalidate_caches()
            # Register main.py as a real module, so helpers can import main and
            # inspect its globals without executing the entrypoint a second time.
            main_module = _types.ModuleType("__main__")
            main_module.__file__ = "main.py"
            module_table["__main__"] = main_module
            module_table["main"] = main_module
            namespace = main_module.__dict__
            execute(compile_code(source, "main.py", "exec"), namespace)
            if test is not None:
                execute(compile_code(test, "test.py", "exec"), namespace)
        except BaseException as error:
            if test is None and isinstance(error, SystemExit) and (error.code is None or error.code == 0):
                return None
            return "".join(format_error(type(error), error, error.__traceback__.tb_next))
        finally:
            stdout.flush()
            stderr.flush()
        return None
    return run

_practice_execute = _make_practice_executor()
`;

scope.onmessage = async ({ data: request }) => {
  // This worker is single-use. The owner terminates it on completion or cancellation.
  scope.onmessage = null;
  const send = (event: RunnerEvent) => scope.postMessage(event);
  let started = performance.now();
  let outputBytes = 0;
  let limited = false;
  let lastFlush = 0;
  let pending: { stream: "stdout" | "stderr"; text: string } | null = null;
  const stdoutDecoder = new TextDecoder();
  const stderrDecoder = new TextDecoder();
  const encoder = new TextEncoder();

  const flush = () => {
    if (!pending?.text) return;
    send({ type: "output", runId: request.runId, ...pending });
    pending = null;
    lastFlush = performance.now();
  };
  const write = (stream: "stdout" | "stderr", bytes: Uint8Array): number => {
    if (limited) return bytes.length;
    const remaining = OUTPUT_LIMIT - outputBytes;
    const accepted = bytes.subarray(0, remaining);
    outputBytes += accepted.length;
    const decoder = stream === "stdout" ? stdoutDecoder : stderrDecoder;
    const text = decoder.decode(accepted, { stream: true });
    if (pending && pending.stream !== stream) flush();
    if (!pending) pending = { stream, text: "" };
    pending.text += text;
    if (pending.text.length >= 4096 || performance.now() - lastFlush > 32)
      flush();
    if (bytes.length > remaining) {
      limited = true;
      flush();
      // Notify the UI before returning to Python. The owner forcibly terminates
      // the worker, even if the Python program catches exceptions or keeps printing.
      send({
        type: "complete",
        runId: request.runId,
        status: "output-limit",
        elapsedMs: performance.now() - started,
        message: "Execution stopped at the 100 KB output limit.",
      });
    }
    return bytes.length;
  };
  const finish = (status: "completed" | "failed", message?: string) => {
    if (limited) return;
    flush();
    send({
      type: "complete",
      runId: request.runId,
      status,
      elapsedMs: performance.now() - started,
      message,
    });
  };

  try {
    const validationError = validateProjectFiles(request.files, request.source);
    if (validationError) {
      finish("failed", validationError);
      return;
    }
    const filesJson = JSON.stringify(request.files ?? {});
    const indexURL = new URL(
      `${import.meta.env.BASE_URL}python/`,
      scope.location.origin,
    ).href;
    // Vite leaves this import alone: these pinned runtime files are copied from
    // the installed npm package and served by this app, including in production.
    const runtime = (await import(
      /* @vite-ignore */ `${indexURL}pyodide.mjs`
    )) as {
      loadPyodide: (options: {
        indexURL: string;
        packages: string[];
      }) => Promise<PyodideInterface>;
    };
    const pyodide = await runtime.loadPyodide({ indexURL, packages: [] });
    pyodide.setStdout({
      write: (bytes: Uint8Array) => write("stdout", bytes),
      isatty: true,
    });
    pyodide.setStderr({
      write: (bytes: Uint8Array) => write("stderr", bytes),
      isatty: true,
    });
    pyodide.runPython(HARNESS);
    const execute = pyodide.globals.get("_practice_execute");
    started = performance.now();
    send({ type: "status", runId: request.runId, status: "running" });
    try {
      if (request.tests !== undefined) {
        let failures = 0;
        for (const test of request.tests) {
          const testStarted = performance.now();
          const error = execute(request.source, test.code, request.stdin, filesJson) as
            string | undefined;
          if (limited) return;
          flush();
          if (error) failures++;
          send({
            type: "test",
            runId: request.runId,
            result: {
              id: test.id,
              name: test.name,
              passed: !error,
              // A pathological assertion message should not inflate a result without bound.
              ...(error
                ? {
                    error:
                      error.length > 16_384
                        ? `${error.slice(0, 16_384)}\n[Traceback truncated]`
                        : error,
                  }
                : {}),
              elapsedMs: performance.now() - testStarted,
            },
          });
        }
        finish(
          failures ? "failed" : "completed",
          `${request.tests.length - failures}/${request.tests.length} tests passed.`,
        );
      } else {
        // undefined maps to Python None; JavaScript null maps to JsNull in Pyodide.
        const error = execute(request.source, undefined, request.stdin, filesJson) as
          string | undefined;
        if (error) write("stderr", encoder.encode(error));
        finish(error ? "failed" : "completed");
      }
    } finally {
      execute.destroy();
    }
  } catch (error) {
    if (limited) return;
    const message = error instanceof Error ? error.message : String(error);
    write("stderr", encoder.encode(`${message}\n`));
    finish(
      "failed",
      "Python encountered an error. You can run again to start a fresh interpreter.",
    );
  }
};
