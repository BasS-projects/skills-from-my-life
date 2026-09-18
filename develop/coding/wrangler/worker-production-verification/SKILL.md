---
name: worker-production-verification
description: Use when changing, deploying, or debugging Cloudflare Workers or other scheduled/stateful production jobs where local tests are not enough. Applies to cron triggers, third-party fetches, webhooks, KV/durable state, deploy verification, runtime limits, production logs, and notification/dedupe workflows. Guides agents to prove deployed behavior from runtime evidence instead of locking on one use case or stopping after tests pass.
---

# Worker Production Verification

Use this as operating knowledge for stateful production Workers and scheduled jobs. The goal is not "the code changed" or "tests pass"; the goal is "the deployed runtime behaves correctly under its real limits, or the exact blocker is proven."

## Verification Mindset

Treat every behavior-affecting change as a production hypothesis:

1. Local tests prove only code intent.
2. Deploy output proves only artifact upload.
3. Runtime logs prove only what happened during observed invocations.
4. Durable state proves what the system will remember and suppress next time.
5. Production limits decide whether the code can actually run.

Never collapse these into one claim. Report them separately.

## General Workflow

For any scheduled or stateful Worker:

1. Inspect the real entrypoint, config, bindings, and state keys before changing code.
2. Add targeted tests for the behavior and for the failure mode that just happened.
3. Run local checks, then deploy if production behavior must change.
4. Confirm the deploy produced a new version id or equivalent artifact proof.
5. Confirm required secrets/bindings still exist.
6. Observe at least one relevant production invocation after deploy.
7. Inspect remote durable state if dedupe, suppression, cursors, checkpoints, or rate-limit state affect behavior.
8. Confirm the production invocation outcome, not just that a log line appeared.

If any step fails, state that boundary precisely. Do not imply production is fixed.

## Runtime-Limit Knowledge

Scheduled Workers can fail even when local tests and deploy pass. Cloudflare Free plan CPU limits can be very small; an `exceededCpu` outcome with `cpuTimeMs` at the plan limit means the invocation did not complete reliably.

When CPU/runtime errors appear:

- Check `outcome`, `cpuTimeMs`, `wallTimeMs`, version id, event type, and request id.
- Do not assume the last code change caused it; compare with plan limits and invocation work.
- Reduce work per invocation before trying to raise limits.
- Avoid adding diagnostic logs that run every cron unless they are temporary and removed after verification.
- Skip irrelevant branches once the primary condition is known.
- Avoid parsing large third-party HTML with broad scans when a targeted signal is enough.
- Remove runtime compatibility flags or dependencies that are not used.
- If a platform limit setting is rejected by the plan, remove it and fix the workload instead.

## Durable-State Knowledge

Remote state can preserve a previous bad decision. A fixed parser or sender may still appear broken if KV/durable state already marked the item as processed.

When debugging stateful workflows:

- Read remote state, not local or preview state.
- Use explicit remote flags or production bindings when the tool supports both local and remote modes.
- Compare current source ids, notification ids, cursors, timestamps, and dedupe arrays against the event being debugged.
- Mutate state only with evidence and as narrowly as possible.
- Remove a poisoned id or cursor only when it is proven to block valid behavior.
- Do not wipe whole state unless explicitly asked or the state is known to be disposable.

## Third-Party Input Knowledge

External pages and feeds can differ by runtime location, user agent, redirect target, language, and rate limits.

For third-party fetches:

- Compare local fetch results with production logs when possible.
- Expect HTML markers to be ambiguous or stale.
- Prefer strong positive signals over absence-based detection.
- Add tests for both sides of every ambiguity: the false positive and the false negative.
- Treat 404/429/5xx from upstream as production conditions, not test-only edge cases.
- Keep fallback paths cheap; a fallback that scans or fetches too much can break cron limits.

## Webhook and Notification Knowledge

For notifications, "sent" must mean the webhook accepted the payload and the system updated state accordingly.

Verify:

- Safe mention controls are separate from message text.
- Secrets exist in production.
- Payload formatting tests cover links, newline text, international text, and mention policy.
- State is marked only after webhook success.
- Retry logic does not exceed runtime limits.
- A dedupe hit is logged or inferable from state when a notification is intentionally suppressed.

## Production Evidence Checklist

A strong final answer includes:

- Local checks run and result.
- Deploy version id or explicit deploy blocker.
- Required bindings/secrets confirmed.
- Production invocation outcome after deploy, including whether it was `Ok` or failed.
- Remote state evidence if state affected behavior.
- Any remaining upstream errors, rate limits, or plan limits.

For this repo, useful commands are:

```bash
cd <path-to-your-worker-repo>
npm test
npm run typecheck
npm run deploy
npx wrangler secret list
npx wrangler tail --format pretty
npx wrangler kv key get "channel:<channel-id>:state" --binding <kv-binding> --remote --text
```

These commands are examples, not the boundaries of the skill. Adapt the same evidence pattern to other Workers, schedules, webhooks, queues, or state stores.

## Agent Anti-Patterns

Avoid these:

- "Tests passed, so production is fixed."
- "Deploy succeeded, so cron is healthy."
- "A log appeared, so the invocation completed."
- "State not found" without checking remote vs local storage mode.
- "Raise the platform limit" before reducing unnecessary work.
- "Clear all state" when only one poisoned id is proven bad.
- "Wait for the user to report the next failure."

The better pattern is to prove the full chain: code intent, deploy artifact, runtime invocation, platform outcome, external dependency behavior, webhook acceptance, and durable state.
