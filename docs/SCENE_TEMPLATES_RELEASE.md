# Complete scene templates release

## Scope

Requested change: add only the complete scene templates from `scene_v0.6.1` and deploy.

- Production baseline: `5279928bbf4751f1a721b54a43e11794ea61a4a6`.
- Template source: `3d4d517e30f33b315b8a226beb5bac36ab803bf1` (`scene_v0.6.1`).
- Release branch: `codex/scene-template-release`.
- Adds bar (38 objects), cafe (46), conference (212), lawn (135), market (57), museum (23), office (76), studio (24): 611 additional editable objects.
- Existing gym (307) and popup (42) remain: 10 presets and 960 editable objects in total.
- Includes original GLBs, preview images, template metadata, source attribution and compatible packaging. Fixed architecture remains separate from editable items.
- Extends preset validation without removing local layers or design history.
- Preserves the production model catalogue (528 placeable / 529 archived), Binggo, account/authentication and all Supabase code/configuration. No database migration, Edge Function deployment or Git main merge.
- Presets retain their existing local-only boundary: browser autosave; cloud saving and AI editing are not supported.

## Validation

- Frontend full regression: 132 files / 1,717 tests pass.
- Typecheck passes; lint has zero errors and one pre-existing import/order warning in `components/business/scene-preview.tsx`.
- Production Pages build passes using current production public Supabase configuration; 1,178 files, maximum 6,655,040 bytes.
- Source template files match the selected source commit. Existing model and thumbnail files and catalogue remain byte-identical.
- Real browser: all eight new scenes render with expected object counts; studio survives reload. Existing 528-model library, account entry, layer tab and Binggo entry remain present.
- Unit coverage includes all 10 templates, editable-object operations, schema round trips, existing grouped-layer operations and preservation of local layers/design history.

## Deployment and rollback

Target: https://scendance.charlestech.org (Cloudflare Pages `scendance-scene-planner`).

Pre-release deployment: `360e5c49-fcab-47ae-8aa4-0284626737ff`, https://360e5c49.scendance-scene-planner.pages.dev . This is the rollback target. Production was rechecked immediately before release preparation and still pointed to this baseline.

Published on 2026-10-03:

- Deployed source commit: `4236ea65a39dc215664282b4dfb74267487282fa` (initial template-only release).
- Preview: https://9a59ca61.scendance-scene-planner.pages.dev . All 38 checked assets and all 3 checked routes matched the build byte-for-byte. The 212-object conference template rendered in a real browser.
- Production: `405e3fc2-91fb-4400-9c01-91c91ea1ab89`, https://405e3fc2.scendance-scene-planner.pages.dev . Wrangler reported deployment complete, and the production deployment list points to source `4236ea6`.
- Formal domain: https://scendance.charlestech.org . Real browser shows all 10 complete-scene template cards, existing account and Binggo entries.
- No Supabase release was performed. Git `main` was not merged or modified; the Pages `main` branch option selects the production deployment environment only.

## Binggo template entry (selected option A)

- Adds a separate `场景模板` tab inside the existing Binggo panel. Reuses `ScenePresetsPanel` and the existing apply/restore-point/undo path; no AI or paid generation call is made by opening or loading a template.
- Retains the existing planning and 3D-generation tabs, including material customization and delivery. Tab switches preserve unsent planning text.
- Full regression after integration: 1,717 tests passed; the sole failing assertion expected the previous two tabs. That assertion was updated to the requested three tabs, and the complete 32-test assistant suite passes on rerun. Typecheck, lint (same pre-existing warning), and production build pass.
- Real browser: all 10 cards appear inside Binggo; loading office creates 76 editable items; Undo restores the original five-item workshop.

Final option-A deployment: `8153b386-93b5-45b8-9904-b6caf94472df`, source `b554910`, https://8153b386.scendance-scene-planner.pages.dev . The formal domain shows all three Binggo tabs and all ten complete-scene cards. The prior template-only deployment `405e3fc2-91fb-4400-9c01-91c91ea1ab89` is the immediate rollback target; `360e5c49-fcab-47ae-8aa4-0284626737ff` restores the pre-template baseline.

Final HTTP verification: 38 resources checked. New entry scripts, CSS, covers and catalogue match the build byte-for-byte. The 10 unchanged GLBs match the previously byte-verified preview locally and return successful production HEAD responses with the GLB content type (length also checked wherever supplied). `/`, `/introduction` and `/reset-password` return 200; their documents match the build after removing only the identified Cloudflare-injected challenge script.
