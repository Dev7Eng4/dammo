# Dammo security checklist

## Secrets & credentials

- [ ] No hardcoded API keys, tokens, passwords, or proxy credentials in source
- [ ] No secrets committed (`.env`, credential JSON, exported cookies)
- [ ] Logs omit tokens, cookies, passwords, session material
- [ ] API responses omit chrome/GPM profile paths, cookies, mail passwords, LLM session secrets

## Input & boundaries

- [ ] HTTP body/params/query validated with Zod (`*.schema.ts`) before use
- [ ] Client-supplied IDs/paths treated as untrusted (no path traversal into profile/data dirs)
- [ ] Unexpected errors do not return stacks or internal details to the client

## Code sinks

- [ ] No `eval` / `new Function`
- [ ] No `dangerouslySetInnerHTML` unless content is intentionally sanitized
- [ ] No widening CORS or exposing privileged endpoints “for convenience” without need

## Dammo-sensitive modules

- [ ] `infrastructure/llm-browser` and related routes — session/cookie handling stays server-side
- [ ] Chrome profiles / GPM — credentials and profile internals not echoed in list/get payloads beyond what UI already requires
- [ ] Mail accounts / proxies — secrets stored and returned consistently with existing redaction patterns

## After changes

- [ ] Prefer AppError + safe messages for expected authz/validation failures
- [ ] If pure secret-parsing or redaction helpers changed, consider a colocated `*.test.ts`
