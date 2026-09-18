---
name: bas-handoff
description: "Write or resume a short evidence-bearing checkpoint when work spans sessions, agents or machines."
---

# bas-handoff

Use the repository's existing canonical task state; in BasOS it is .basos/work/TASK with plan/status/handoff. Do not create a competing HANDOFF database in the vault.

Record goal/constraints, completed/current work, branch/commit and uncommitted files, actual checks/results, decisions, blockers and any external operation whose outcome needs inspection. End with one next action and minimum resume files. Use relative repository paths and no host ownership.

Write paired checkpoint files atomically per file with matching checkpoint IDs; on resume compare IDs and inspect current Git/runtime state. For a running BasOS queue, use its status/export/restore procedure; do not edit SQLite projections as if they were authoritative.

Checkpoint at meaningful boundaries, blockers or context pressure, not every tiny command. A handoff is not automatic history compression, model restart, live-process transfer or exactly-once execution.
