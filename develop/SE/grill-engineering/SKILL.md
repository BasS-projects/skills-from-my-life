---
name: grill-engineering
description: "Ask one short batch about data flow, state and failure behavior when validating implementation understanding or solution architecture."
---

# grill-engineering

Inspect supplied code/diagrams before asking. Ask at most seven concise questions in one batch, skipping answers already evident:
1. How does data travel from input to output?
2. Where does authoritative state live?
3. What can fail at the important boundaries?
4. What happens if this runs twice?
5. What happens if it stops halfway?
6. Which observation/test would show it is wrong?
7. Which mechanism do we still not understand?

Lite mode uses goal, simple alternative, failure and proof only. Translate concurrency/transactions/idempotency into concrete scenarios. Do not require every question for a formula or small script. Resolve key gaps before risky implementation, while continuing independent read-only work. Do not claim the user understands a mechanism merely because AI generated it.
