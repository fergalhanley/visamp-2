# AI creation: implementation baseline and MVP decisions

Replaces the PoC implementation proposal. Reviewed at f224eeebd0fa003cda6c5fbd65e01eb3ac3f9a7e.
Product authority: [MVP specification](../dev/mvp.md). Work: [ticket drafts](../dev/mvp-backlog.md).

## Implemented in code; deployment and quality unverified

- Editor sends prompt, current source, visual ID and a fixed provider key.
- Available provider choices: Anthropic, OpenAI and Qwen; models configured server-side.
  The old two-slot/escalation-ladder proposal is not the current implementation.
- Server checks feature enablement, authentication/ownership and request admission.
- Postgres enforces rate/concurrency/credit admission; active requests reserve available balance.
- Generation runs a bounded retry loop against a private browser render validator, streaming
  status events. Successful code updates the editor; exhausted validation leaves it unchanged.
- Completion records success/failure; only successful generation is charged.
  Fault-path accounting and recovery still need validation.
- Append-only AI ledger supports signup grants, generation charges, refunds and adjustments.
  Signup grants default to zero until configured. Numeric README examples are not pricing.
- A compiler-parity CI workflow and validator tests exist; existence is not proof that current
  deployment builds/configuration/tests have passed.

## Source and operational references

- [Generation route](../apps/web/app/api/ai/generate/route.ts)
- [Provider/validator client](../apps/web/lib/ai/server.ts)
- [Admission and completion](../apps/web/lib/ai/guardrails.ts)
- [Credit migration](../supabase/migrations/20260907170000_ai_credit_ledger.sql)
- [Web setup guide](../apps/web/README.md)
- [Validator](../apps/validator/README.md)

## MVP work to define

Stripe purchase flow, credit display/history, metering/pricing, grants, expiry,
refund/recovery rules, cost measurement, signup allowance, and any recurring plans.
No payment integration was found in the reviewed code.

Define DSL launch coverage and evaluate actual creation/edit quality. Preserve the unresolved
candidate work on versioned real-music audio fixtures: keep existing fixture versions immutable,
record rights/provenance for new recordings, reproduce production analyser frames, retain
synthetic fixtures and evaluate thresholds against good/static/audio-ignoring examples.

Prompt history, model escalation, AI disclosure and detailed eval infrastructure described
in the old proposal are not automatically approved MVP scope. Reassess during creator discovery.
