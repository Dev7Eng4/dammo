# Module checklist

Use after scaffolding a feature. All items should pass before calling the work done.

## Server

- [ ] Files use kebab-case + role suffixes (`.routes`, `.schema`, `.service`, …)
- [ ] Server imports use relative paths with `.js` extensions
- [ ] Zod validates request bodies/params/query
- [ ] Routes stay thin; logic lives in service
- [ ] Registered in `mountApiRoutes` (both `/api/v1` and `/api`)
- [ ] Success payloads use `{ item }` / `{ items }` (or existing pagination helpers)
- [ ] Failures use shared AppError / `isAppError` pattern

## Client

- [ ] API module uses `fetchJson` and `/api/v1`
- [ ] Relative imports only (no `@/` alias)
- [ ] Page/components follow existing folder layout
- [ ] UI primitives come from `components/ui` (Radix + CVA + `cn`)
- [ ] No new global state library unless requested

## i18n & quality

- [ ] New user-facing strings in both `en` and `vi` locale files
- [ ] No drive-by refactors outside the feature
- [ ] No secrets logged; inputs validated on the server
