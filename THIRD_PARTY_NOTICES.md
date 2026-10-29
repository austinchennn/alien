# Third-party components

Alien's original source is MIT licensed. Dependencies retain their own licenses in their npm packages; see the pinned package-lock.json for exact versions and transitive dependencies.

| Component | Version | License | How it is used |
| --- | --- | --- | --- |
| Pi Coding Agent / Agent Core / AI | 1.4.0 | MIT | Imported official SDK, sessions, compaction, standard skills, MCP, file read/write/edit |
| Playwright MCP | 0.0.83 | Apache-2.0 | Installed local stdio MCP server; browser binaries are installed separately |
| Playwright | 1.64.1 | Apache-2.0 | Browser tooling and regression testing |
| Fastify / @fastify/static | package-lock.json | MIT | Local HTTP application |
| React / React DOM | 19.3.1 | MIT | Local GUI |
| tsdav | 2.5.0 | MIT | iCloud CalDAV client |
| ical.js | 2.2.1 | MPL-2.0 | Imported unmodified calendar parser and recurrence engine |
| Ajv | 8.20.0 | MIT | JSON schema validation |
| TypeBox | 1.3.27 | MIT | Tool schemas |
| Superpowers selected skills | commit 2ce8aa15d05bd57213e6f746f953aafb7ded7a8b | MIT | Vendored Markdown and supporting references under skills/vendor/superpowers; upstream LICENSE is retained there |

Superpowers source: https://github.com/obra/superpowers/tree/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b . Selected directories: systematic-debugging, verification-before-completion, test-driven-development, writing-skills, plus supporting runtime reference documents. Bundled as instructions and supporting references, without the upstream bootstrap extension. The scripts and instructions are not run merely by installation.

vLLM (Apache-2.0) and Podman (Apache-2.0) are installed separately in WSL by an optional preparation step. Node.js and its included components retain their distributed notices. No model weights are redistributed. Each chosen model and quantization has its own license.

No source from leaked Claude Code distributions is included. Researching a repository's README is not a license grant.
