---
name: dammo-security
description: >-
  Security-focused review and hardening for dammo (secrets, Zod boundaries,
  logging, XSS, chrome/llm-browser/GPM credentials). Use when the user asks for
  a security review, AppSec check, hardening, or secret/credential handling.
---

# Dammo security

Focused AppSec pass for this repo. Prefer concrete findings over generic OWASP essays.

## Progress

```
- [ ] Scope (diff vs module) identified
- [ ] Checklist run (see references/checklist.md)
- [ ] Critical findings listed with fixes
- [ ] Suggestions (non-blocking) listed
```

## Workflow

1. **Scope** — user-named paths, current diff, or modules touching auth/credentials (`llm-browser`, chrome-profiles, gpm, mail-accounts, proxies, app-settings).
2. **Scan** with [references/checklist.md](references/checklist.md).
3. **Report** Critical first, then Suggestions. Each item: path, risk, dammo-aligned fix (Zod schema, AppError, strip fields from JSON, env — not “add Nest guards”).
4. **Fix only if asked** — otherwise stop at the report.

## Severity

- **Critical** — secret leak, missing validation on write/read of sensitive data, XSS sink, credentials in client bundle
- **Suggestion** — tighter logging redaction, clearer error codes, defense-in-depth
