# VisAmp — AI Code Generation Spec

**Status:** ready for implementation
**Scope:** AI-assisted DSL script generation in the VisAmp editor, credit metering, AI-assisted disclosure, and the eval/cost infrastructure needed to price it.

---

## 1. Overview

Add AI generation to the editor so users can produce and modify DSL visualisation scripts from natural language. Generation runs entirely server-side through a validation loop that guarantees returned code parses, compiles, and actually renders before the user sees it. Usage is metered in credits; new accounts get a free allowance.

The UI exposes two model slots. Behind each slot, the model is resolved per attempt from a configurable ladder — a cheaper model handles the common case and escalates to a stronger one when validation fails. The pipeline is model-agnostic; adding or swapping a model is config plus an eval run.

**Two design constraints that shape everything below:**

1. Nothing is **silently applied** to the user's editor unless it has been validated server-side. A script that fails validation may still be offered to the user, but explicitly, labelled, and only applied on their action (§4.4).
2. Credit pricing cannot be set until real per-generation costs are measured. Ship the levers, not the numbers.

---

## 2. Architecture

### 2.1 Compiler parity

The DSL compiler (Rust / Pest) builds to two targets from the same crate:

- **WASM** — client-side embeddable visualiser component, **and** the server-side render validator (§2.3)
- **Native** — server-side parse/compile validation (`visamp-validate`)

The native target is used for fast parse/compile checking only. All *rendering* validation runs the WASM build in a headless browser, so there is no second renderer implementation to keep in sync.

These must never diverge. A script validated server-side that fails client-side is the exact failure this pipeline exists to prevent.

- Compiler version string recorded on every generation record and every saved script
- Both targets built in the same CI job; build fails on version mismatch — **implemented**
- Shared fixture suite run against both targets

### 2.2 Generation pipeline

Server-side, per request:

```
1. Build prompt (system prompt + DSL grammar + few-shot examples + user input
                 + current script, if edit mode)
2. Resolve model for THIS attempt from the slot's attempt ladder (§2.4)
3. Call model
4. Extract script from response
5. Parse / compile (native compiler)
       ├─ fail → append diagnostic to conversation, goto 2 (max 3 attempts)
       └─ pass → continue
6. Headless render validation (§2.3)
       ├─ fail → append diagnostic to conversation, goto 2 (same attempt budget)
       └─ pass → return script, charge credits
7. Attempt budget exhausted → return diagnostics + closest attempt as an *offer*,
   not applied to the editor. DO NOT CHARGE
```

Attempt budget is a config value, default 3, covering both compile and render failures on a single counter.

**Model escalation.** The model is resolved *per attempt*, not per generation. A slot defines an ordered ladder of models; attempt 1 uses the first rung, later attempts escalate. The cheap model handles the common case; failures — where the model is fighting an unfamiliar grammar — get the stronger model with the compiler diagnostic already in context.

Conversation history carries across the escalation. The stronger model sees the earlier attempts and their diagnostics.

**Streaming:** each attempt's status is emitted to the client as it happens (see §4.2). The client does not receive intermediate code — only the final result.

### 2.3 Render validation

A compiling script can still be dead. Every generation is rendered before it is returned.

**Execution environment: headless browser running the exact WASM build**, not a native renderer. The 2D renderer depends on browser Canvas APIs and 3D frame capture has no native path, so a native renderer would be a second implementation — reintroducing precisely the divergence risk §2.1 exists to eliminate. Running the shipped WASM in a real browser means validation and production execute identical code.

Run each script against a **small versioned set of audio fixtures** and check:

| Check | Purpose |
|---|---|
| Renders N frames without panic or error | Runtime stability |
| Output is not uniform (per-frame pixel variance above threshold) | Catches black/blank screens |
| Output varies **across** frames | Catches static images |
| Output differs across audio fixtures | Catches scripts that ignore audio input |
| Frame cost within budget (relative — see below) | Catches unusably slow scripts |

**Frame-time must be measured relatively.** Headless environments render in software (SwiftShader or equivalent), which bears no resemblance to a user's GPU. An absolute millisecond threshold measured there is meaningless and will drift with CI and hosting changes. Instead, render a **known-good reference script** in the same environment on every validation run and express the candidate's cost as a ratio against it. Threshold is a ratio, versioned with the reference script.

**Audio fixtures.** Mostly synthetic — sine sweeps, impulse trains, band-limited noise — because they're deterministic and reproducible, which the variance checks depend on. Include at least one short real music clip: synthetic signals lack the spectral density of real audio, and a script can pass a clean sweep while looking dead against an actual track. Anything committed must be self-produced or CC0.

Multiple fixtures matter: a single clip lets the model overfit to one waveform and produce something that only looks alive against that clip.

**Operational notes:**

- Pool warm browser instances; cold-starting per attempt will dominate latency
- Cap total validation wall-clock independently of the attempt budget, so a pathological script can't hang the request
- Frame count, resolution, fixture set and reference script are pinned constants — record which versions validated each generation
- Each check independently toggleable via config, so a noisy check can be disabled without a deploy
- Thresholds are config, tuned during testing

### 2.4 Model slots

Slot-based indirection between the UI and the provider. A slot is a user-facing choice; the models behind it are an implementation detail.

```
slot {
  key                     // e.g. "standard", "open"
  display_name            // shown in UI — NOT a provider model name
  enabled
  credit_multiplier
  prompt_template_version
  ladder: [               // ordered, resolved per attempt
    { attempt: 1,   provider, model_id, params },
    { attempt: 2..3, provider, model_id, params }
  ]
}
```

**Launch slots** (model identifiers are **provisional** — confirm current API availability, exact model IDs and hosting route at integration time; treat every value below as config, never a constant in code):

| Slot | Attempt 1 | Attempts 2–3 | Notes |
|---|---|---|---|
| `standard` | Claude Sonnet 5 | Claude Opus 5 | Default selection |
| `open` | GLM-5.2 | GLM-5.2 | Open-weight; self-host path if volume ever justifies it |

Both slots must clear the eval harness (§6) before launch. If `open` doesn't clear it, ship one slot — a bad option is worse than no option, because users read a poor result as VisAmp being bad, not as their model choice being bad.

Rules:

- UI references slots, never provider model IDs
- **Do not display raw model names to users** — they get deprecated on someone else's schedule
- Every generation record stores the resolved provider + model_id **per attempt**, plus prompt template version, for debugging and cost attribution
- Adding or swapping a model = config change + eval harness run; no code change
- Ladder rungs are independently configurable — escalation strategy is a lever, not a constant

### 2.5 Cost measurement notes

Two things will distort early cost figures. Account for both before setting credit prices:

- **Prompt cache TTL.** The static prefix (grammar + examples) is only cheap on a cache hit, and the default cache window is short. At launch traffic you will mostly miss and pay full input rates. Investigate extended-TTL caching, and treat early per-generation costs as an overstatement of steady state.
- **Tokenizer.** Recent Claude models tokenize more densely than older ones — roughly 30% more tokens for the same text, workload dependent. Measure the actual prefix with the actual model rather than estimating; an estimate can be a third out before you start.

Log `input_tokens`, `cached_input_tokens`, `output_tokens` and `provider_cost` **per attempt**, not per generation, or escalation makes the cost data unreadable.

---

## 3. Data model

Additive to the existing schema. Names indicative.

### `ai_generations`
| Column | Notes |
|---|---|
| `id` | |
| `user_id` | |
| `vis_id` | nullable — generation may precede first save |
| `mode` | `one_shot` \| `edit` |
| `slot`, `prompt_template_version` | slot selected by the user |
| `compiler_version`, `audio_fixture_set_version`, `reference_script_version` | |
| `attempts` | int |
| `outcome` | `success` \| `exhausted` \| `error` |
| `credits_charged` | 0 when `exhausted` |
| `total_provider_cost` | sum across attempts |
| `duration_ms` | |
| `created_at` | |

### `ai_generation_attempts`
One row per model call. Escalation means a single generation can span models, so cost and failure data must be recorded at this grain.

| Column | Notes |
|---|---|
| `id`, `generation_id`, `attempt_index` | |
| `provider`, `model_id`, `params` | resolved rung of the ladder |
| `failure_stage` | `null` \| `parse` \| `compile` \| `render` |
| `failure_detail` | diagnostic text — feeds the eval corpus |
| `input_tokens`, `cached_input_tokens`, `output_tokens`, `provider_cost` | |
| `duration_ms` | |

### `ai_prompts`
Private to the author. Never joined into any public query.

| Column | Notes |
|---|---|
| `id`, `generation_id`, `user_id` | |
| `prompt_text` | user's natural-language input |
| `attempt_index` | |
| `created_at` | |

Store diagnostics from failed attempts here or in a sibling table — they're the eval corpus.

### `credit_accounts` / `credit_transactions`
Ledger, not a mutable balance column. Balance is derived from the transaction sum (or a cached column reconciled against it).

Transaction types: `signup_grant`, `purchase`, `generation_charge`, `refund`, `adjustment`.

### Additions to the visualisations table
| Column | Notes |
|---|---|
| `ai_assisted` | boolean |
| `parent_id` | already planned for forks — written **server-side on the fork event**, not client-supplied |

`parent_id` is currently the only lineage relation. Similarity detection is deferred (§8).

---

## 4. Editor behaviour

### 4.1 Modes

**One-shot** — user describes a visualisation; model generates from scratch. Replaces editor contents (with an undo path).

**Edit** — model receives the current script plus an instruction, returns a modified script. Diff presented before applying, or applied with undo — pick one and be consistent.

Both modes run the identical validation pipeline. They are metered separately (§5.2).

### 4.2 Progress reporting

The repair loop surfaces to the **existing log panel** below the preview. Do not rewrite the editor contents mid-loop — the user sees code only when the pipeline succeeds or gives up.

Log lines should be legible to a non-programmer, e.g.:

```
Generating…
Compile failed (attempt 1) — line 42: unexpected token '}'
Retrying…
Compiled. Checking render…
Render check failed — output is static, no audio response
Retrying…
Compiled. Render OK. Done.
```

On exhaustion, see §4.4.

### 4.4 Exhaustion behaviour

When the attempt budget is exhausted:

- State clearly that no credits were charged
- Show the diagnostics from the closest attempt
- Offer the closest attempt as an explicit action ("insert this attempt anyway") — do **not** auto-apply it to the editor
- Leave existing editor contents untouched unless the user takes that action

The script is usually close, and a user with the compiler and error panel in front of them can often finish it by hand. Withholding it entirely wastes the work; applying it silently breaks the promise that generated code works.

### 4.5 Prompt history

- Visible to the author in the editor; lets them review and re-run variants
- **Never rendered on public visualisation pages**
- Not attached to forks — a fork does not carry the parent's prompt history

---

## 5. Credits

### 5.1 Model

ElevenLabs-style prepaid credits. All internal model calls for one generation are bundled into a single user-facing charge — retries are the platform's problem, not the user's.

- `outcome = exhausted` → charge nothing
- Charge on success only, written as a ledger transaction in the same operation that returns the result

### 5.2 Metering levers

All of these are config, changeable without a deploy:

- Credit cost for `one_shot`
- Credit cost for `edit` (metered separately from the start so it *can* be priced differently — set equal initially)
- Per-slot credit multiplier
- Signup free-credit grant
- Attempt budget
- Ladder composition per slot — which model serves which attempt

Actual values are determined in testing from `ai_generation_attempts` cost data. **Do not hard-code prices anywhere.**

**Escalation is invisible to the user.** A generation costs the slot's price whether it succeeded on the cheap rung or escalated twice. Users must never be able to reason about which model served their request from what they were charged — that reintroduces the quality-tiering conversation the single-price design exists to avoid.

Note that per-slot pricing implies a quality claim whether or not one is made. If both slots clear the eval bar, consider pricing them the same and letting the choice be about preference rather than cost.

### 5.3 Purchase & expiry

Purchase flow is out of scope for this pass — free signup credits only for the first release. When purchase lands:

> Check how Australian prepaid/gift-card rules apply to purchased credit packs before writing any expiry into the terms. The three-year minimum on gift cards is the sort of thing that catches consumer SaaS out. Not legal advice — get it checked.

### 5.4 Abuse

- Rate limit generations per user and per IP independently of credit balance
- Free grant is once per account; account creation already has Turnstile
- Log and alert on anomalous generation volume

---

## 6. Eval harness

Build this before pricing, before the second model. It is the gate for shipping any model.

- **~50 fixed prompts** with expected outcomes, covering: simple/complex generation, edit-mode instructions, ambiguous prompts, prompts that should fail gracefully
- Runs the full pipeline including render validation
- Reports: compile-pass rate, render-pass rate, mean attempts to success, mean provider cost per success, mean latency
- Runnable against any slot config, and against a **single model with escalation disabled** — you need per-model figures to design the ladder, not just per-slot ones
- Versioned in the repo alongside the audio sample set

**A model ships only if it clears the bar on this harness.** The metric that matters is cost-per-*successful*-generation, not per-token price — a cheaper model needing three repairs can cost more than an expensive one needing none.

The harness is also what validates the escalation strategy. Specifically, measure: first-attempt success rate per model (determines whether the cheap rung is worth having), and success rate of the strong model *given* a failed cheap attempt in context (determines whether escalation recovers failures or just repeats them). Public coding leaderboards will not answer either question — they measure agentic repo work, not one-shot generation in an unfamiliar grammar.

Generations that exhaust their attempt budget in production are candidates for the eval set. Provide an easy path to promote them.

---

## 7. Privacy

- Prompt text is free-form user input and will contain personal information regardless of what the UI says
- Prompts and diagnostics are retained server-side for eval and pipeline tuning — **state this plainly in the privacy policy**
- Provide user-initiated deletion of prompt history
- Prompts must not appear in any public query, API response, or export
- Review against the Australian Privacy Principles before launch, with attention to free-text fields

---

## 8. AI-assisted disclosure

- Any visualisation produced or modified with AI carries an `ai_assisted` flag
- The flag travels through **explicit forks only** — a fork inherits its parent's flag
- This is a disclosure norm, not an enforcement mechanism. Copy-paste evasion is possible and accepted for now
- Be lenient on false negatives; do not build punitive UI around the flag

---

## 9. Out of scope

Explicitly deferred. Do not build:

- **BYO API keys** — revisit once the core pipeline is stable
- **Similarity detection / fingerprinting / `inspired_by`** — deferred; `parent` is the only lineage relation
- **Public prompt sharing** — shelved
- **NFTs** — possible future monetisation, not a provenance mechanism
- **Credit purchase flow** — free signup grant only in this pass
- Self-hosting the open-weight model — hosted API at launch; revisit only if volume justifies it

---

## 10. Build order

1. ~~Native compiler target + CI parity check~~ — **done** (compiler v2.0.0, 206 tests, parity workflow)
2. Headless browser render validator + versioned audio fixtures + reference script
3. Generation pipeline with repair loop — slot + ladder resolution in place, single model configured, **config-backed placeholder credit costs** (never hard-coded)
4. Schema: `ai_generations`, `ai_generation_attempts`, `ai_prompts`, credit ledger + per-attempt cost logging
5. Editor UI: one-shot mode, log panel integration, exhaustion offer (§4.4)
6. Eval harness — run all candidate models individually
7. Configure ladders and enable both slots based on (6)
8. Edit mode
9. Credit metering levers + signup grant
10. `ai_assisted` flag + fork inheritance

Steps 4 and 6 are the unglamorous ones that everything else is priced off. Don't defer them — step 7 is not decidable without step 6.