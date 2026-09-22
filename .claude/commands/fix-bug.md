---
description: Find the root cause of a PantryMind bug and fix it with a test that fails first
argument-hint: <symptom, steps to reproduce, screenshots>
---

Bug report: $ARGUMENTS

1. **Reproduce or trace** — find the code path that produces the symptom. Explain the root
   cause with `file:line` before changing anything. If it can only happen on a device, say how
   to confirm it there.
2. **Failing test first** — encode the bug as a test (domain spec when the cause is a rule) and
   watch it fail for the reason you identified.
3. **Fix** — the smallest change that makes the test pass. Look for the same mistake elsewhere
   (other chains, other call sites) and say what you found.
4. **Verify** — lint, check-icons, the full test suite and the production build. Check it in
   the browser when it's reachable there.
5. **Review** — for anything beyond a one-liner, run the `reviewer` agent on the diff.

Finish with: root cause, fix, tests added, verification results, and what to check on a device.
