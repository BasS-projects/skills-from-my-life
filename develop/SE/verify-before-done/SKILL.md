---
name: verify-before-done
description: "Match completion claims to actual test, command or UI evidence before reporting a deliverable finished."
---

# verify-before-done

List the meaningful claims, the smallest checks that prove them, which checks actually ran, and what remains unverified. Prefer behavior/outcome evidence over syntax-only or mocked-intermediate checks.

Scale checks to risk. A reversible document edit may need inspection; a retry/state change needs failure-path verification. Do not force TDD or write tests that repeat implementation text.

Report code saved, Git pushed, service deployed and live behavior accepted separately. Re-run only when new edits or unresolved evidence justify it. Never convert a successful fixture into a claim about a live provider.
