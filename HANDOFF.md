# HANDOFF

**Updated:** 2026-10-19 | **Branch:** noble/scraper-main-integration | **Base:** deb460c3b

## State
Scraper branch c053c7d72 is being integrated with main deb460c3b in an isolated worktree.
Source conflicts are resolved. Static lint, build and privacy checks passed. Main delivery and the authorized restart remain pending; tests and CI stay off.

## Done this session
- Combined Image Sources, source previews, header spacing, the Bank review viewport fix and Auto-Center with main's identity learning, Studio and aligned queue changes.
- Preserved both route registrations, help entries and schema assertions; retained stable What's New identifiers in descending order.
- Kept main's bundle in the source merge. Rebuild merged assets in a separate build(frontend) commit before activation.

## Open
1. Commit and push main with [skip ci], then restart through the existing app action and verify health and served assets.
2. Tests, rendered behavior, live provider access and Auto-Center model accuracy remain unverified. Run only an explicitly requested scope. Earlier source-panel screenshots do not cover Auto-Center.
3. The operator chose a local identity accuracy set. Await its location/labels and explicit evaluation authorization; keep images local. Report wrong names, misses, abstentions and provenance. Similarity thresholds remain unmeasured heuristics.
4. Physical phone/PWA acceptance, installed-source trainer compatibility and real GPU/training comparisons remain operator gates. Opt-in live encoder/Ollama checks were not run.
5. If the Bank tab error recurs, collect the first browser ErrorBoundary line. The original live tab error and earlier desktop tag timeout have unconfirmed causes.

## Decisions
- Image Sources uses manual Scan, Load Previews, Download and Import Images actions. Opening a panel does not start network work.
- Keep two aligned columns of text/controls above the full-width normal Bank thumbnail grid. Stack controls on mobile.
- Auto-Center defaults to Full Subject with roughly 10% padding; review and adjust the box before Crop. Reuse the configured local vision model only after a click.
- Preserve Bank derivative saves and Dataset training-image crop limits. Retain the selection after failed saves; refuse ratios that cut the detected subject.
- Keep main's aligned queue columns and its shared human-confirmed identity records, correction/Undo behavior, subject regions and content/model provenance.
- Every test run needs an explicit request. Delivery without tests uses [skip ci] and does not claim full qualification.

## Traps
- Build away from the running checkout. Backend activation needs a metadata backup and a controlled restart; do not import create_app against production as a check.
- Tests, responsive probes, fixtures and model inference remain off. Static lint/build/privacy inspection is permitted.
- Keep frontend source and generated dist in separate commits. Preserve unrelated worktrees and the original scraper branch.
- Keep real data names, images, settings and credentials private. Checkpoint metadata under ignored Git storage only.
- Do not move Auto-Center inference into passive requests or effects. Failed-save exceptions must reach CropModal.
- Do not merge upstream branches. The upstream review below is carried forward unchanged.

## Verify
Merged-tree Ruff passed. ESLint passed with zero errors and 32 existing warnings. Production build passed. Privacy scan covered 3072 text files with zero findings; attribution inspection has no unresolved findings. The reviewed outbound inventory is unchanged. Tests, model inference and rendered validation did not run. Activation remains pending. Historical receipts qualify only their recorded commits.
Prior identity/upstream qualification: 2673a79faf05a5d01d1c85585585620be51a2bbf, Fork Gates 39183822421 and post-push CI 39185814233. Queue run 39189043465 was cancelled before full Gates finished; no further tests were authorized.
Scraper tip c053c7d72 had successful lint/build/privacy inspection, with 32 existing ESLint warnings. Auto-Center regression files were written but never run; no live model call or rendered check was made.
Permitted commands (use the existing pinned interpreter from the primary checkout when this worktree has no .venv):
```powershell
.venv/Scripts/python.exe -m ruff check .
cd frontend
npm run lint
npm run build
```

### Carried-forward upstream review
On 2026-10-19, upstream's default branch remained v2 at 1a150ab4c6eb50ccd887d8e6b2675430fb2dca5c. v1 remained 3fe3d4f0e29e28de583a6e22bce886c35e5ecd3f. The review started at fork acf4ee146, with merge base d13337cc3. The previous reviewed SHA d566904e4 matched Overwatch and is an ancestor of the new head. The review window contains 7 commits; raw ancestry counts are not missing features.

| Upstream commits | Class and evidence |
| --- | --- |
| ceda138f1, b6a59b17d | REJECT. Patreon membership features on plugin catalog cards conflict with Distribution and Divergence 12. The catalog was removed in 6c056974f; `patreon_core.py` never existed in the fork. The What's New entry drops with the feature, per the 2026-10-18 Patreon precedent. |
| ba60ca167, 87d4d8984 | SKIP-BUILD. Rebuild the fork bundle from its own source. |
| bd5e42e6f | REJECT. Retain the fork version (`+fork`) and `APP_RELEASE_CHANNEL`. |
| d0fbe41c7 | REJECT. Docker Ollama test timeout; the test was deleted with the packaged-image path in ad0439ff9 (Distribution, Divergence 5). |
| 1a150ab4c | REJECT. Test fixture binds `lds_cloud_training.public_api_v1`; the cloud_training plugin is excluded in `fork-plugins.json` and removed in d9e94fc21 (Divergence 4). No fork test enables it, so the race cannot occur. |

Decision: nothing ported. A later review starts after `1a150ab4c`. Do not merge upstream/v1 or upstream/v2.
