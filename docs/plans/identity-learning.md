# Identity assignment and recognition

Status: approved for implementation on 2026-10-18. No runtime or accuracy qualification is complete.

## Required outcomes

- Photographic people: reusable named identities, confirmed face examples, suggested matches, bulk assign/unassign and identity filters across Bank and Dataset.
- Anime: catalog and custom names, series/aliases, several characters per image, manual assignments and reviewed tagger suggestions.
- Original characters: learn from confirmed names and corrections, suggest matches across artwork/outfits/poses/styles, and qualify on unseen labeled artwork.
- Shared: profile isolation, durable manual decisions, content/model provenance, preservation through promotion/import/export, and unchanged captions/triggers/source files/Keep/Reject decisions.

## Learning through assignment

A name binds a stable identity to selected subject evidence. Confirmed evidence joins the local reference set. Later matches use the current set. Corrections remove the old contribution. Rejecting a candidate excludes that identity for the subject. Undo restores only state that still belongs to the action, so later decisions win.

Unconfirmed suggestions cannot become examples. An image may hold several names, but a whole frame cannot teach each identity without explicit subject regions. Missing models, stale pixels, unusable faces and ambiguous matches remain unmeasured or uncertain.

## Implementation waves

1. Add profile-scoped identities, subject evidence, assignments, feedback and safe undo; share services and APIs between Bank and Dataset.
2. Add photographic extraction and prepared local semantic matching; preserve model spaces and confirmed decisions.
3. Add offline vocabulary import, custom names, category-aware WD14/PixAI suggestions and shared controls/filters.
4. Integrate promotion, import/export/profile metadata, documentation, help, news and a separate generated bundle commit.
5. Run isolated cloud behavioral/rendered checks on the exact source and bundle. Evaluate recognition separately on labeled unseen artwork.

Catalog assignment alone does not complete the scope. Retraining is an option only after existing engines fail a measured accuracy target; it must not run silently after a label.

## Acceptance checks

- Assigning/confirming a name creates a durable reusable example; an original character needs no pretrained catalog entry.
- Suggestions reflect added/corrected/removed/undone examples. Rejected pairs remain excluded and uncertain results remain unconfirmed.
- Multiple characters, aliases, unavailable engines, stale pixels and interruptions have explicit recoverable outcomes.
- Filters, counts and bulk actions follow the actual selected scope on both surfaces.
- Promotion and supported transfers preserve IDs or explicitly remap within the destination profile; no implicit cross-profile sharing occurs.
- Identity actions leave captions, triggers, source bytes and image review decisions unchanged.
- Backend/frontend behaviors and populated portrait/landscape/tablet/desktop checks pass in the cloud.
- Accuracy receipts report wrong names, misses, abstentions and held-out corpus/model contracts. Synthetic vectors do not prove recognition accuracy.

## Prior work and delivery

The worktree starts from 5d32d6ceb, including unqualified upstream ports documented by that commit's HANDOFF.md. Preserve that source and the running checkout. Local tests remain unauthorized. Permitted real accuracy data remains pending. Source and bundle use separate commits. Main publication requires cloud Gates and applicable authorization.
