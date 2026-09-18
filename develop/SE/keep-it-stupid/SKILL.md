---
name: keep-it-stupid
description: "Simplify existing code when requested by removing demonstrated unnecessary layers and obscured error paths."
---

# keep-it-stupid

First identify the behavior to preserve and an observable check. Trace the actual flow before deleting wrappers, interfaces, factories, configuration or classes.

Prefer functions and explicit data flow when that is clearer. Keep a useful stateful class when converting it merely moves complexity elsewhere. Every proposed abstraction removal must name the cost it removes and the behavior it preserves.

Remove catch-and-continue paths that conceal defects only within scope. Keep recovery that has a defined outcome; when adding error context, preserve the original exception chain. Do not weaken validation, transactions, idempotency or security merely to shorten code.

Make the smallest simplification, run the relevant check and report the result. No unrelated style rewrite or speculative framework replacement.
