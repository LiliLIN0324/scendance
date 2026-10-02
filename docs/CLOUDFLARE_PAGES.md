# Cloudflare Pages

Build from the repository root with `npm ci`, `npm --prefix frontend ci`, then
`npm --prefix frontend run build:pages`. Use the Node version required by
`frontend/package.json`. Deploy only `frontend/out/`.

- `/`: existing welcome screen and local/cloud editor.
- `/introduction`: the root product showcase, packaged as `introduction.html`.
- `/showcase/`: isolated showcase assets, renderer and Three.js dependencies.

The editor brand links to `/introduction`; the showcase's enter button links to
`/`. Cloudflare Pages serves the extensionless introduction URL. The packaging
step preserves the standalone root development page.

Existing project: `scendance-scene-planner`, production branch `main`, custom
domain `scendance.charlestech.org`. Check current project settings and preserve
any production public backend configuration before building. Upload a preview
branch first, verify both routes and navigation, then upload the same artifact
to the production branch. Record the prior deployment ID for dashboard rollback.

This frontend deployment does not deploy the Supabase backend or enable AI.
