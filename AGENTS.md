# Agent Operating Protocol

This file applies to the entire Visamp monorepo. All coding agents working in
this repository must follow this protocol.

For Linear connection setup, eligible task selection, claim coordination and handoff,
read [the Linear agent workflow](agents/linear-workflow.md). That guide supplements
this protocol; it does not replace its prerequisite, progress or review requirements.

## Sources of truth

- **Linear** is the source of truth for planned work, scope, priority,
  dependencies, ownership, status, and acceptance criteria.
- **GitHub** is the source of truth for code, branches, commits, pull requests,
  reviews, and permanent technical documentation.
- **The active task conversation** is the progress feed for concise updates,
  blockers, questions, and handoffs. No Slack connection or reporting is required.
- If these sources disagree, stop and ask for clarification. Do not silently
  choose one interpretation.

## Branches

There are two long-lived branches and no others.

- **`develop` is where work happens.** Commit to it directly. There are no
  per-issue branches, no feature-branch naming convention, and no pull request
  for ordinary work.
- **`main` is production.** It changes only through a pull request from
  `develop`, opened when the project owner decides the state of `develop` is
  worth releasing. Merging to `main` deploys.

A short-lived branch is the exception, not the rule. Use one only when a change
genuinely needs review before it reaches `develop` — something risky,
far-reaching, or that another person asked to see first — and merge it into
`develop`, never into `main`.

Committing straight to `develop` removes the review gate that a per-issue pull
request used to provide, so what is committed has to stand on its own:

- Run the relevant checks **before** committing, not after.
- Keep each commit to one coherent change, so a bad one can be reverted alone.
- Never commit work you have not verified, and never leave `develop` broken.
  If you break it, fixing it comes before anything else.

CI runs on every push to `develop`, so a broken commit is visible rather than
silent — but it reports after the fact. It is not a substitute for running the
checks yourself first.

## Before starting work

1. Work from a Linear issue whenever an issue has been provided.
2. Read the complete issue, its acceptance criteria, dependencies, and linked
   decisions before changing code.
3. Confirm that prerequisite work is complete. If it is not, report the blocker
   rather than implementing around an unresolved dependency.
4. Move the issue to **In Progress**, or ask the project owner to do so if the
   agent cannot update Linear.
5. Post a concise progress update in the active task conversation:

   ```text
   STARTING <ISSUE-ID> — <short description>
   ```

6. Work on `develop`. Pull before you start, so you are building on what
   everyone else has already integrated.

## While working

- Stay within the Linear issue's stated scope.
- Treat acceptance criteria as the definition of completion.
- Do not make unrelated refactors or opportunistic changes in the same commit.
- Preserve existing user or agent work. Never discard changes merely because
  they are outside the current task.
- Add or update tests for changed behaviour where practical.
- Run the smallest relevant checks during development and the full relevant
  verification before handoff.
- Record durable product or architectural decisions in Linear and, when they
  affect future implementation, in repository documentation. Conversation updates
  alone are not a sufficient decision record.
- Reference the Linear issue ID in every commit message, and in the release
  pull request when the work is part of one.
- When work overlaps another active issue, coordinate through Linear and post
  the conflict in the active task conversation before editing the shared area.

## Progress updates

Conversation updates are intended to let the project owner track agent activity without
reading every commit. Post an update when:

- work starts;
- a meaningful milestone is reached;
- the task becomes blocked;
- scope or acceptance criteria need clarification;
- the work is integrated into `develop` and ready to be looked at.

Keep routine updates short. Put detailed technical reasoning, requirements
changes, and durable decisions in Linear or repository documentation.

Use these formats:

```text
PROGRESS <ISSUE-ID> — <completed milestone>; next: <next step>
BLOCKED <ISSUE-ID> — <blocker>; needs: <specific decision or action>
READY <ISSUE-ID> — on develop at <commit>; <verification summary>
```

## Finishing a piece of work

There is no pull request for ordinary work. When the implementation is ready:

1. Run the relevant checks and confirm they pass.
2. Commit to `develop` and push.
3. Move the Linear issue to **In Review**, or ask the project owner to do so.
4. Post the `READY` update in the active task conversation, naming the commit.
5. Leave the issue open until its acceptance criteria have been verified.
6. Do not mark the issue **Done** unless authorised by the project owner or the
   task instructions explicitly grant that authority.

## Releasing to production

`main` is updated by a pull request from `develop`, and only when the project
owner asks for one. Do not open it because work looks finished.

That pull request must:

- say what is being released, as a summary of the issues included rather than a
  commit list;
- name anything a reviewer should weigh: deliberate deviations, unmet
  acceptance criteria, known limitations, follow-up work;
- list the checks performed against `develop`;
- avoid claiming completion for anything whose acceptance criteria are unmet.

Do not merge it unless the project owner authorises that specifically.
Merging deploys production.

## Blockers and ambiguity

Stop and request clarification when:

- requirements conflict;
- a choice would materially change product behaviour or architecture;
- required credentials, permissions, assets, or dependencies are unavailable;
- the requested action is destructive or would overwrite another contributor's
  work;
- acceptance criteria cannot be verified.

When blocked, do not leave `develop` half-changed. Either commit something that
stands on its own, or keep the work uncommitted and say so. Describe the current
state in the Linear issue and post a `BLOCKED` update in the active task conversation.

## Completion standard

Work is ready for review only when:

- the implementation matches the issue scope;
- every acceptance criterion is satisfied or explicitly identified as pending;
- relevant tests and checks pass;
- documentation is updated where behaviour or architecture changed;
- the commit messages and the Linear issue contain enough context for another
  agent or human to continue without reconstructing the work from chat history.


---

## Active handoff: LFO modulation Phase 1 (PR #15, 2026-10-24)

**Task owner instruction:** Continue the already-approved LFO implementation on
`feature/lfo-modulation-core` and update draft
[PR #15](https://github.com/fergalhanley/visamp-2/pull/15).
This is an expressly requested short-lived, reviewable feature branch. Do not
silently switch to `develop`, retarget the PR, merge, or deploy. Existing branch
and release policies above otherwise remain in force. If the branch exception
or missing Linear issue requires reconciliation, raise that explicitly rather
than inventing an issue ID. No Linear issue ID was supplied in this handoff.

### Product intent and sequence

Colin's live-visualisation use case: tempo-synchronised oscillators automate
multiple visual parameters with minimal performance interaction. Deliver in
order: **Phase 1 engine/modulation API**, **Phase 2 editor panel**, then **Phase
3 performance presets, keyboard controls, MIDI later**. Do not build the editor
as part of this PR. Default modulation belongs to a visualisation; future
performance overrides can belong to a VJ set without altering the original.

### Starting point (inspect rather than assuming it is correct)

- `packages/player/src/lfo-modulation.ts`: initial pure TypeScript LFO
  evaluator, configurable four-LFO bank, waveforms (sine, triangle, square,
  saw-up, saw-down, seeded sample-and-hold), phase/BPM/bar timing, numeric
  property routing and validation.
- `packages/player/src/lfo-modulation.test.ts`: initial Vitest tests, **not
  yet verified passing**.
- `packages/player/src/index.ts`: exported public TypeScript API.
- Existing Rust/WASM engine: `packages/engine/src/lib.rs`,
  `interpreter.rs`, `model.rs`, `frame_clock.rs`; player bridge:
  `packages/player/src/types.ts`, `visamp-canvas.tsx`, and
  `properties-bridge.ts`.
- `get_properties()` currently provides a read-only snapshot. The engine
  must evaluate effective numeric properties before script operations consume
  them; post-render display changes alone are insufficient.

### Implementation work

1. **Audit the foundation.** Run player tests and TypeScript checks first.
   Fix any waveform/timing/validation issues found. Review the first-pass
   route policy (add offsets relative to a range midpoint; clamp to the
   intersection of active route bounds). Document or test chosen semantics,
   including zero-depth and overlapping/conflicting ranges. Confirm how
   pause, seek, tempo changes, and seeded random step boundaries behave.
2. **Determine proper engine hook.** Trace how `prop` is declared, stored,
   reassigned, and read per frame. Add a typed numeric-only *effective
   override* path at the point of property reads or evaluation, without
   permanently mutating source-defined/base values. Preserve existing
   behaviour if modulation is absent or disabled, and do not permit overrides
   on nonnumeric properties. Avoid modifying output snapshots as a proxy.
3. **Expose a narrow stable WASM boundary.** Supply validated modulation
   configuration or effective overrides to the running engine and provide
   useful errors on invalid payloads. Ensure configuration changes, script
   reloads, and engine lifecycle do not leak stale overrides. Consider
   whether engine clock time can be reused so live playback, pause, seek,
   and export share deterministic timing. Avoid duplicate independently
   advancing clocks.
4. **Connect the player.** Reuse existing animation-time handling; apply
   modulation early enough for a script frame to consume the effective
   properties. Keep SDR/HDR rendering paths unchanged. Make the feature
   opt-in and backward compatible. Do not introduce editor controls now.
5. **Persistence boundary.** Define a versioned serializable modulation
   config and demonstrate how it can be associated with a visualisation,
   without implementing full editor persistence unless it is strictly
   necessary for Phase 1. Keep VJ-set override design extensible.
6. **Verify.** Add Rust unit/integration tests for property precedence,
   base-value preservation, numeric type checks, lifecycle, and disabled
   routing. Add player tests for waveform boundaries, beat division, seeded
   random determinism, seek/pause and effective values. Run relevant
   `cargo test`, `pnpm --filter @visamp/player test`, TypeScript checks,
   and appropriate monorepo build/CI checks; report exact commands and
   results. A minimal existing Viscript example with visibly modulated
   rotation or zoom is the end-to-end smoke test.

### Acceptance criteria

- Four LFOs can be configured and routed to numeric Viscript properties via
  an API, without editing the script source.
- An LFO demonstrably affects a property **used by rendering**, not merely
  the inspector.
- Base property values survive playback, override removal, seek and reload.
- Deterministic evaluations at fixed timeline positions, regardless of frame
  cadence; seeded random remains reproducible.
- Unconfigured/disabled routing retains existing Visamp behaviour.
- Tests pass with recorded commands/results and no regression in SDR/HDR.
- Changes remain on the feature branch in draft PR #15 for owner review.

### Agent handoff / reporting

Post a concise start note, meaningful milestone updates and a final summary
of changed files, observed results and unresolved risks to the active task
conversation or PR, according to available channels. Never claim tests were
run if they were not. Do not merge PR #15 or trigger a production deployment
without the project owner's explicit approval.
