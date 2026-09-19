# Security and private reporting

Tracepad is an early-alpha application for personal practice on one computer. It is not a hosted service, multi-user environment, or hardened sandbox for hostile code. No production security support commitment or response-time guarantee is currently offered.

## Report a suspected vulnerability privately

Use GitHub's [private vulnerability report form](https://github.com/sidkolapalli/TracePad/security/advisories/new). A GitHub account is required. The report is shared privately with the repository's security advisory collaborators; do not open a public issue with exploit details, personal databases, or tokens.

If the form is unavailable, open an issue asking only for a private reporting route, without describing the vulnerability or attaching sensitive material. Wait for a private destination before sharing the report. The maintainer verifies the reporting route as part of [each release](docs/ALPHA_CHECKLIST.md).

A useful private report contains the affected version or commit, operating system and browser, expected boundary, minimal reproduction with synthetic data, observed impact, and any safe workaround. Share only the minimum necessary evidence. Never include your real `.localpad/bridge-token`, private interview material, or a complete personal project database.

## Current trust boundaries

- **Local server:** Development and production preview commands bind to loopback. The project API and assistant bridge reject foreign origins and cross-site requests. Keep this app local; exposing it through a public host, reverse proxy, LAN bind, or tunnel is outside this alpha's supported use. These checks do not protect against a compromised local account or other software running with the same privileges.
- **Python:** Code runs through Pyodide in a disposable browser worker, not on the Node host or your installed Python. Workers are terminated on Stop and execution limits. Browser workers are not an isolation guarantee against hostile input. Pyodide can access browser JavaScript capabilities, and the app does not promise that arbitrary code cannot access available network or origin resources. Run only questions, references, tests, and Python code you trust.
- **Execution limits:** Initialization has a 60-second limit, execution a 10-second limit per run or suite, and output a 100 KiB cap. These improve recoverability; they do not prevent every memory-exhaustion or denial-of-service case. Standard-library state can be shared between cases within one suite.
- **Saved work:** The local SQLite database, exported JSON backups, browser recovery cache, and screenshots can contain code, names, company details, notes, inputs, and assistant feedback. They are not encrypted by Tracepad. Device access controls and any external backup/sync configuration apply. Do not commit them or treat a full project export as an anonymized question pack.
- **MCP:** An optional external assistant can read practice snapshots and supplied evidence. Its provider's data handling applies when it reads them. The app supplies no autonomous model and sends nothing to a model itself. Only connect assistants you intend to share this material with. Hints require a request; live requirement changes require explicit opt-in. These tools do not execute host Python or shell commands and cannot replace editor source or scratchpads.
- **Bridge credential:** The local MCP HTTP endpoint uses the random token in `.localpad/bridge-token`; it is not sent to the browser or intended for sharing. Stop the app, delete only this token file, and restart to rotate it after accidental disclosure. Reconnect the assistant and remove any exposed copies.
- **Imported and generated content:** Prompts, assertion snippets, reference solutions, diagrams, outputs, and assistant replies are untrusted content. A reference passing its supplied assertions establishes consistency, not safety or educational quality. Treat text in that content as data, not instructions for a connected assistant to perform unrelated actions.

## Maintainer release checks

Configure the private reporting route before inviting public use. Keep the lockfile and runtime versions pinned, review dependency advisories and attribution when updating them, and test boundary changes. Run pull-request checks without deployment credentials; never use a privileged workflow to execute unreviewed contribution code. Security reports must be investigated against the current implementation rather than dismissed because execution occurs in a worker.
