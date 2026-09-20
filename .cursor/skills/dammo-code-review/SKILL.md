---
name: dammo-code-review
description: >-
  Reviews dammo PRs and diffs for correctness, security, tests, architecture,
  layering, naming, i18n, and maintainability. Use when reviewing pull requests,
  examining diffs, cleaning up a change, or when the user asks for a code review
  with security, performance, or test angles.
---

# Dammo code review

Review against `.cursor/rules` (core-quality, security, typescript-style, server-hono, client-react, react-quality, error-handling, i18n, testing) and nearby modules.

## Angles (run each pass)

1. **Correctness** — empty/error/abort paths; no silent `catch`
2. **Security** — Zod on inputs; no secrets in logs/responses; no unsafe HTML/`eval`
3. **Architecture** — thin Hono routes; services own logic; pages not dumping domain logic
4. **Tests** — new pure/merge/schema logic deserves colocated `*.test.ts` when non-trivial
5. **Conventions** — naming, imports (server `.js`; no `@/`), `{ item }`/`{ items }`, i18n en+vi
6. **Diff size** — no unrelated refactors or dead code

## Feedback format

Group findings as:

- **Critical** — must fix before merge
- **Suggestion** — clarity / maintainability
- **Nice-to-have** — optional polish

For each finding: **file path** (and line when known), short why, concrete fix direction.

## What not to nitpick

- Style already settled in the same folder
- Large rewrites outside the change set
- Drive-by Redux/React Query/aliases/Prettier/Jest migrations
