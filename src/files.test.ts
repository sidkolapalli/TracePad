import { describe, expect, it } from "vitest";
import { MAIN_FILE, MAX_MODULE_FILES, MAX_PROJECT_BYTES, getActiveFile, getFileSource, listFiles, validateFilePath, validateProjectFiles, withFileSource } from "./files";
import type { Draft } from "./types";

const draft: Draft = { source: "main code", stdin: "", tests: [], files: { "helpers.py": "helper code", "pkg/__init__.py": "" }, activeFile: "helpers.py" };

describe("Python project files", () => {
  it.each(["helpers.py", "_private.py", "pkg/__init__.py", "pkg/nested/math2.py", "__init__.py"])("accepts relative Python module path %s", (path) => {
    expect(validateFilePath(path)).toBeNull();
  });
  it.each(["main.py", "", "../escape.py", "/absolute.py", "pkg/../../escape.py", "pkg\\helpers.py", "hello world.py", "tools.js", "foo.py/bar.py", "2module.py", "class.py", "a//b.py", "C:/helpers.py", "pkg/.hidden.py", "x".repeat(181) + ".py"])("rejects unusable or unsafe path %s", (path) => {
    expect(validateFilePath(path)).toBeTruthy();
  });
  it("enforces count and UTF-8 source limits and rejects module/package ambiguity", () => {
    expect(validateProjectFiles(undefined, "main")).toBeNull();
    expect(validateProjectFiles({ "a.py": "helper" }, "main")).toBeNull();
    expect(validateProjectFiles(Object.fromEntries(Array.from({ length: MAX_MODULE_FILES + 1 }, (_, i) => [`m${i}.py`, ""])))).toContain("32");
    expect(validateProjectFiles({ "a.py": "☃".repeat(Math.floor(MAX_PROJECT_BYTES / 3)) }, "long enough")).toContain("1 MiB");
    expect(validateProjectFiles({ "a.py": "x".repeat(MAX_PROJECT_BYTES) })).toBeNull();
    expect(validateProjectFiles({ "a.py": "x".repeat(MAX_PROJECT_BYTES) }, "x")).toContain("1 MiB");
    expect(validateProjectFiles({ "pkg.py": "", "pkg/tools.py": "" })).toContain("module and package");
    expect(validateProjectFiles({ "main/tools.py": "" })).toContain("module and package");
    expect(validateProjectFiles({ "pkg/__init__.py": "", "pkg/tools.py": "" })).toBeNull();
    expect(validateProjectFiles([])).toBeTruthy();
    expect(validateProjectFiles({ "a.py": 12 })).toContain("must be text");
  });
  it("keeps main.py canonical and orders remaining tabs deterministically", () => {
    expect(listFiles(draft)).toEqual(["main.py", "helpers.py", "pkg/__init__.py"]);
    expect(getFileSource(draft, MAIN_FILE)).toBe("main code");
    expect(getFileSource(draft, "helpers.py")).toBe("helper code");
    expect(getFileSource(draft, "toString")).toBe("");
    expect(getActiveFile(draft)).toBe("helpers.py");
    expect(getActiveFile({ ...draft, activeFile: "deleted.py" })).toBe(MAIN_FILE);
    expect(getActiveFile({ ...draft, activeFile: "toString" })).toBe(MAIN_FILE);
    expect(getActiveFile({})).toBe(MAIN_FILE);
  });
  it("updates either main.py or a module without mutating another file or the original", () => {
    const main = withFileSource(draft, MAIN_FILE, "new main");
    const helper = withFileSource(draft, "helpers.py", "new helper");
    expect(main.source).toBe("new main");
    expect(main.files).toEqual(draft.files);
    expect(helper.source).toBe("main code");
    expect(helper.files?.["helpers.py"]).toBe("new helper");
    expect(helper.files?.["pkg/__init__.py"]).toBe("");
    expect(draft.files?.["helpers.py"]).toBe("helper code");
    expect(() => withFileSource(draft, "../escape.py", "")).toThrow();
  });
});
