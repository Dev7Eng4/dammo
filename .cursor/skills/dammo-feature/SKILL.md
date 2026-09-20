---
name: dammo-feature
description: >-
  Scaffolds and wires full-stack dammo features end-to-end (Hono module, API
  client, React page, i18n). Use when adding a new page, API endpoint, Hono
  module, or full-stack feature across client and server.
---

# Dammo feature workflow

Follow this when adding a new domain feature. Prefer copying an existing module (e.g. `prompts`, `app-settings`) over inventing structure.

## Progress

```
- [ ] Domain & boundaries decided
- [ ] Server schema → types → service → routes
- [ ] Registered in register-modules.ts (dual mount)
- [ ] Client api + types
- [ ] Page / components
- [ ] i18n en + vi
- [ ] Smoke checklist passed
```

## Step 1 — Domain

- **HTTP CRUD / settings**: `server/src/modules/<name>/`
- **Heavy pipelines**: `video-production` (steps/ports) vs `video-production-ui` (HTTP) — do not mix
- **Browser/LLM automation**: `infrastructure/llm-browser` + module routes

## Step 2 — Server

1. `*.schema.ts` — Zod input/output
2. `*.types.ts` — domain types (`z.infer` where useful)
3. `*.service.ts` — business logic
4. `*.repository.ts` / `*.file-store.ts` — persistence
5. `*.routes.ts` — Hono + `@hono/zod-validator`; thin handlers
6. Register in `server/src/app/register-modules.ts` inside `mountApiRoutes` so both `/api/v1` and `/api` get the routes

Response shape: `{ item }` / `{ items }`. Errors via `isAppError` → `{ error, code }`.

## Step 3 — Client

1. `client/src/api/<name>.ts` — thin `fetchJson` wrappers against `/api/v1/...`
2. Types in the API module or `client/src/types/`
3. Page in `client/src/pages/`; feature UI under `components/<domain-kebab>/`
4. Extend `components/ui` if a primitive is missing — do not add a second UI kit
5. Wire route in `App.tsx` if needed

## Step 4 — i18n

Add keys to both `client/src/i18n/locales/en/` and `vi/` for the correct namespace. No hardcoded UI copy.

## Step 5 — Finish

See [references/module-checklist.md](references/module-checklist.md).

Keep the diff minimal; match naming and import rules from project `.cursor/rules`.
