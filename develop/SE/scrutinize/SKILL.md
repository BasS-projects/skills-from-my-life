---
name: scrutinize
description: "Review a proposed design, code change or PR by tracing real behavior and testing simpler alternatives."
---

# scrutinize

State the actual goal and ask whether the change is necessary. Consider an existing mechanism or a smaller solution before adding architecture.

Trace entry point → callers → state/side effects → failure/return, including relevant unchanged code. Compare claims with executed checks; identify dependencies, concurrency, repeated execution and partial failure where they matter.

Report only actionable findings with file/line or source evidence, consequence and smallest useful correction. Separate verified defects, hypotheses and design tradeoffs. If no defects are found, state what was traced and what remains untested. Do not manufacture nits or auto-launch reviewer agents.
