---
name: debug-mantra
description: "Diagnose a concrete bug using reproduction, fail-path tracing and falsifiable experiments."
---

# debug-mantra

Preserve the original error and input. Find a minimal reproducer or characterize the available captured failure; if reproduction is impossible, investigate the evidence and label hypotheses rather than inventing certainty.

Trace the real fail path using a debugger when useful, otherwise source and focused instrumentation. Change one explanatory variable at a time. For each plausible cause, identify evidence that would disprove it and run the most discriminating experiment. Maintain a short experiment ledger for a long investigation.

A fix must explain all relevant observations and pass the original repro plus meaningful regressions. After repeated identical failures, change the diagnostic approach instead of looping. Do not recite a mantra, require a fixed number of hypotheses, hide stack traces, or block harmless inspection until perfect evidence exists.
