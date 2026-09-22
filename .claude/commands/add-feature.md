---
description: Plan and implement a PantryMind feature following the project's conventions
argument-hint: <what the feature should do>
---

Feature request: $ARGUMENTS

1. **Understand** — find where it fits and what already exists to reuse (domain functions,
   services, components, i18n keys). If the latest PostHog data or a past decision bears on it,
   say so. Check `CLAUDE.md` and `.claude/docs/` for conventions.
2. **Propose** — a short plan: files to touch, domain rules to add, i18n keys, analytics events,
   what can only be verified on a device. **Wait for approval before writing code.**
3. **Implement** — test-first for domain rules. Small changes inline; larger ones with the
   `developer` agent, one task at a time.
4. **Verify** — lint, check-icons, tests and the production build all green; check it in the
   browser (`npm start`) when it's visible there.
5. **Review** — run the `reviewer` agent on the diff and address Critical/Important issues.
6. **Document** — if conventions, commands or shared patterns changed, run the `documenter` agent.

Finish with: what changed, verification results, and the device QA list.
