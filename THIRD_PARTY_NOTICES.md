# Third-party notices

Tracepad's original project code is licensed under the root [MIT license](LICENSE). Third-party code retains its own terms; a package's declared license expression is not a replacement for its license text.

## Distributed notices

- [Full notices](public/THIRD_PARTY_NOTICES.txt) include the production npm dependency closure, Monaco's bundled third-party notices, Lucide's ISC and Feather-derived MIT notices, Vite/Rolldown's emitted browser helpers, and the pinned Python runtime notices. Vite copies this file to `/THIRD_PARTY_NOTICES.txt` in the production build.
- [Machine-readable inventory](docs/licenses/npm-inventory.json) records exact locked package versions, integrity values, and notice hashes. It includes optional native packages for every platform in the lockfile; this does not mean every binary ships in a browser build.
- [Runtime sources](docs/licenses/runtime/sources.json) record exact upstream revisions, URLs, and SHA-256 hashes of LF-normalized notice text. Copies are kept beside that manifest so installation and builds need no license download.

Run `npm run notices` after a dependency update, review the diff, and commit both generated files. `npm run notices:check` fails when a required license is missing, an installed package differs from the lockfile, a runtime version changes without an attribution review, or generated notices are stale. Generation is deterministic across supported operating systems: esbuild's optional platform binaries use the matching upstream esbuild notice, and the macOS-only fsevents notice is vendored.

## Python runtime

The installed `pyodide@314.0.7` npm package declares MPL-2.0 but does not contain a LICENSE file. Tracepad supplies the full license from the [same Pyodide release](https://github.com/pyodide/pyodide/tree/314.0.7). Its source, including build recipes and patches, is available there. Tracepad copies the core loader, WebAssembly binary, standard-library archive, and package metadata without modifying them. The package catalog is metadata; listed optional Python packages are not automatically bundled or installed by Tracepad.

The pinned metadata identifies CPython 3.14.2 and Emscripten 5.0.3. Preserved upstream notices cover Pyodide, CPython and its documented incorporated software, Emscripten, musl, libc++, libffi, hiwire, zlib, bzip2, liblzma/XZ, and zstd. The exact references follow the Pyodide release's `Makefile.envs` and `cpython/Makefile`, and the corresponding Emscripten port recipes. SQLite 3.39.0 is identified by those build recipes; upstream describes SQLite's source as public domain in its [copyright statement](https://www.sqlite.org/copyright.html).

Before changing the pinned runtime or distributing a separately rebuilt binary, repeat this review against its build recipes and preserve any additional notices. This source alpha installs the pinned upstream npm distribution; it does not rebuild CPython or Emscripten. The inventory records identified upstream components and their notices, rather than claiming a symbol-level audit of the WebAssembly binary.

## Icons, fonts, and content

Interface icons come from `lucide-react`; their full bundled notice includes the Feather-derived icons. Monaco includes its own icon assets and upstream notices. The interface uses system font stacks and does not redistribute those fonts. The Tracepad mark and favicon are repository-authored SVG code; no downloaded photos or illustration assets are bundled.

The recorded project provenance of the built-in exercises, generated local question templates, reference solutions, hints, and tests is repository-authored content: the project requested original exercises and created them locally. Their files do not record third-party exercise sources. Before public distribution, a maintainer should review the content for any adapted wording or code and preserve attribution where applicable. New contributions must disclose adapted sources and their licenses in the exercise contribution template.

User-created questions, prompts, code, notes, and imported data remain user data. Exporting or sharing a project does not grant permission to redistribute someone else's interview questions. These files are not part of the repository's bundled content.
