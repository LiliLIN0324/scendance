# Frontend ownership

This directory belongs to role A (Sandraddd). Read README.md before changing it.

- Use `../supabase/functions/_shared/domain.ts` and `../client/scene-client.ts` as the backend contract, not the older team draft. Do not fork a parallel wire schema.
- Backend work, database migrations, secrets and root dependency changes belong to B. Propose API changes through a reviewed PR.
- Keep the editor adapter responsible for origin, angle and dimension conversion. Do not silently drop unsupported fields or fabricate cloud asset IDs.
- Local save, mock validation and real cloud verification must be reported separately. No automatic fake account, generation or cloud-save fallback.
- Verify relevant tests, `npm run typecheck` and `npm run build` from this directory. Root `npm test` runs backend tests only.
- Preserve UPSTREAM-LICENSE and asset provenance. Do not commit `.env.local`, node_modules, `.next`, `out` or TypeScript build caches.
