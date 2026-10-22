# After-Action Reviews

## Shared environment exposed through worktree junction - 2026-10-21 [TOOLING]

**Planned:** Publish the profile fix, preserve the live checkout, then activate its matching bundle without tests.
**Actual:** Publication succeeded. Core runtime packages disappeared after a temporary worktree with a dependency junction was archived. Startup failed until the application environment was restored.
**Delta:** Activation required environment recovery before Studio could start. Database, settings and source checkpoints remained available and unchanged.
**Cause:** The temporary worktree exposed the live environment through a Windows directory junction. Package loss and directory timestamps coincide with archive cleanup; the cleanup tool's internal traversal was not observed.
**Correction:** Delivery workflow: use independent dependencies for disposable worktrees and reject archival while any dependency junction points outside that worktree. Do not expose a live environment to cleanup.

The damaged environment and restoration logs remain in ignored activation storage.
Recovery used the documented dependencies, the recorded CPU Torch version and the
core Pillow/NumPy constraints. Package consistency and runtime imports passed.
Studio reached health under its supervisor, on the original profile, with the
matching served bundle. Tests, responsive probes, inference and training were not run.
The activation comparison found no unexpected metadata changes: 44 tables stayed
identical and one peer record changed only its heartbeat timestamp. Four saved
settings files and all 31 checkpointed source files retained their hashes.

Follow-up, 2026-10-21: the cleanup preflight and user-level Codex hook are now
installed. The guard rejects all filesystem links and incomplete inspections;
repo and global agent guidance require independent worktree dependencies.
The system-Python launcher and hook live outside disposable worktrees and the
application environment. Automatic hook enforcement awaits the operator's
`/hooks` review and trust. Static checks and the actual remaining-worktree
inspection passed. No destructive cleanup or test fixture was run.

Trust follow-up, 2026-10-21: the Codex CLI `/hooks` screen confirms the cleanup
entry is enabled and Trusted, with one active PreToolUse hook. The displayed
definition matches the reviewed installation. A trust record already existed;
no trust setting or bypass flag was needed. No tests or worktree cleanup ran.
