# Skills From My Life

Reusable AI-agent skills shaped by everyday AI use across chat and coding workflows, mostly from working with ChatGPT and Codex.

This repo starts small on purpose. Each skill should be practical, portable, and easy to copy into another AI account or install as a skill folder.

## Structure

Skills are grouped by lifecycle first:

- `launch/` for skills ready to use regularly
- `develop/` for skills still being shaped
- `deprecated/` for skills kept for reference only

Each lifecycle has the same categories:

- `daily/`
- `SE/`
- `coding/`
- `other/`

## All Skills

| Skill | Status | Path |
|-------|--------|------|
| skeptical-research | launch | `launch/daily/skeptical-research` |
| change-guard | launch | `launch/coding/refactor/change-guard` |
| github-https-repo-auth | develop | `develop/SE/github-https-repo-auth` |
| codex-sandbox-git | develop | `develop/SE/codex-sandbox-git` |
| git-feature-branch-hygiene | develop | `develop/SE/git-feature-branch-hygiene` |
| youtube-status-official-api | develop | `develop/coding/wrangler/youtube-status-official-api` |
| worker-production-verification | develop | `develop/coding/wrangler/worker-production-verification` |

## Available Skills

### skeptical-research

Path: `launch/daily/skeptical-research`

Use this skill for skeptical, evidence-driven research and decisions about tools, products, AI models, APIs, subscriptions, pricing, quotas, limits, privacy, TOS, licenses, commercial use, and production readiness.

Best for questions like:

- "Which AI subscription should I pay for?"
- "Can I use this API output commercially?"
- "Is this pricing or quota still current?"
- "Is this tool production-ready?"
- "Compare these two software stacks for my use case."

### change-guard

Path: `launch/coding/refactor/change-guard`

Use this skill to guard structural, refactoring, dependency, contract, and configuration changes by capturing the baseline, making the change deliberately, and checking for stale references or docs afterward.

## Develop Skills

Still being shaped:

- `develop/SE/github-https-repo-auth` - repo-scoped GitHub HTTPS auth and push troubleshooting
- `develop/SE/codex-sandbox-git` - Codex sandbox git workflow and escalation cautions
- `develop/SE/git-feature-branch-hygiene` - keep unrelated git work on separate branches
- `develop/coding/wrangler/youtube-status-official-api` - require official YouTube Data API evidence for channel, live, upload, and ownership checks
- `develop/coding/wrangler/worker-production-verification` - verify scheduled or stateful Workers from deployed runtime evidence, bindings, logs, and remote state

### Security warning

- `develop/SE/codex-sandbox-git`: may guide approved commands outside normal sandbox boundaries for `.git` metadata writes, credential helpers, tool caches, or network git operations. Review those steps carefully and prefer the smallest command scope that completes the task.

Develop skills not listed here do not currently have a known sandbox-boundary warning.

## Installation

### Option 1: npx skills (Recommended)

Install all skills at once from the GitHub repo:

```bash
npx skills add https://github.com/siraphob-vutthanun/skills-from-my-life
```

Works with Claude Code, Codex, and any `npx skills`-compatible platform.

### Option 2: Manual Copy

Clone the repo and copy skill directories into Codex's skill folder (`~/.codex/skills`) or your platform's equivalent:
```bash
mkdir -p ~/.codex/skills
cp -R launch/daily/skeptical-research ~/.codex/skills/
cp -R develop/SE/github-https-repo-auth ~/.codex/skills/
# ... copy any other skill directories you need
```

## Use With Codex

After installing, invoke a skill by name in your prompt:

```text
Use $skeptical-research to compare these two AI plans for my workflow.
```

Or let Codex auto-detect the skill from context.

## Use In ChatGPT

For chat-only use, copy the contents of any `SKILL.md` file (e.g. `launch/daily/skeptical-research/SKILL.md`) and paste it into a custom instruction, project instruction, custom GPT instruction, or the top of a new chat. Each v1 skill is self-contained, so no extra reference files are required.

## Design Principles

- One portable `SKILL.md` is the source of truth for each v1 skill.
- Extra reference files are added only when real usage proves they are needed.
- Prefer concise, decision-focused behavior over large prompt libraries.
- Keep official facts separate from interpretation, recommendation, community opinion, and uncertainty.
- Avoid marketing language and unsupported certainty.

## Future Expansion

The `skeptical-research` skill may later grow optional reference files for answer patterns, source quality rules, or TOS/privacy checklists. If that happens, `SKILL.md` should remain usable alone for chat copy-paste workflows.

## Contributing

Contributions should come from real repeated use, not speculative prompt design.

Feedback from using these skills is welcome and helps improve them. New unrelated skills may be considered case by case, especially when the maintainer has not personally tested or used that workflow enough to judge it well.

Before adding a new skill or expanding an existing one:

- Keep the smallest structure that works.
- Prefer one self-contained `SKILL.md` for v1.
- Add references only when they reduce repeated context or make the skill easier to maintain.
- Keep examples practical and decision-oriented.

## Core skills from personal workflows

Eight core skills from the BasOS work are maintained under `develop/SE/`.
`basos-workflow` is excluded; `handoff` is exported as `bas-handoff`.
See [PROVENANCE.md](PROVENANCE.md) for authorship and source limitations.
Shared principles are in [CONSTITUTION.md](CONSTITUTION.md).

- [keep-it-stupid](develop/SE/keep-it-stupid/SKILL.md)
- [grill-design](develop/SE/grill-design/SKILL.md)
- [grill-engineering](develop/SE/grill-engineering/SKILL.md)
- [verify-before-done](develop/SE/verify-before-done/SKILL.md)
- [bas-handoff](develop/SE/bas-handoff/SKILL.md)
- [debug-mantra](develop/SE/debug-mantra/SKILL.md)
- [scrutinize](develop/SE/scrutinize/SKILL.md)
- [post-mortem](develop/SE/post-mortem/SKILL.md)
