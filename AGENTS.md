# Agent Operating Protocol

This file applies to the entire Visamp monorepo.

Visamp is in a fast prototype/validation phase. The repository uses concise Markdown planning instead of Linear so agents can spend context and time on the product.

## Sources of truth

Read these in order:

1. [`agents/requirements.md`](agents/requirements.md) — product capabilities and definition of done.
2. [`agents/milestones.md`](agents/milestones.md) — the sequence of product states being pursued.
3. [`agents/todo.md`](agents/todo.md) — the small active work queue for the current milestone.
4. [`agents/backlog.md`](agents/backlog.md) — committed later work; do not implement until promoted.
5. [`agents/maybe.md`](agents/maybe.md) — uncommitted ideas; do not implement until deliberately promoted.

Detailed design documents live under `agents/designs/` and are read only when a todo item links to them or the task clearly depends on them.

The old `dev/mvp*.md` and Linear workflow documents are historical context, not current scope or task authority.

## Planning rules

- Requirements change deliberately and relatively slowly.
- Milestones define sequencing, not detailed task breakdowns.
- `todo.md` changes frequently and should normally contain no more than about 10 active tasks.
- Keep todo items concise. Link requirement IDs rather than repeating acceptance prose.
- Put known-later work in `backlog.md`.
- Put plausible but uncommitted ideas in `maybe.md`.
- Do not implement backlog or maybe items unless the project owner explicitly asks or they are promoted into todo.
- If a task needs substantial design work, create a focused document under `agents/designs/` and link it from todo.
- Do not create planning bureaucracy for its own sake.

## Starting work

1. Read requirements, milestones and todo.
2. If the project owner supplied a specific task, work on that task. Otherwise take the first sensible unchecked todo item whose prerequisites are met.
3. Read any linked design document and only the repository context needed for the task.
4. Work from the latest `develop`.
5. Post a concise task update in the active conversation when useful:

   ```text
   STARTING — <short description>
   ```

If another agent is visibly working on the same area, avoid duplicating or overwriting that work.

## While working

- Stay within the selected task and linked requirements.
- Prefer small, coherent changes over broad refactors.
- Preserve existing user and agent work.
- Reuse existing Visamp capabilities before adding parallel implementations.
- Keep core business capabilities below the UI where practical so they can later serve web, API and MCP clients.
- Add or update tests for changed behaviour where practical.
- Run the smallest relevant checks during development and the full relevant verification before handoff.
- Record durable architectural/product detail in a focused design doc when future agents would otherwise need to reconstruct it from code or chat.
- Do not silently change product requirements to fit an implementation.

## Updating the planning files

When a task is complete:

- mark its todo checkbox complete;
- mark a requirement complete only when the capability itself has been verified;
- add newly discovered immediate work to todo only if it is genuinely needed for the current milestone;
- put definite later work in backlog;
- put speculative ideas in maybe.

If todo grows beyond roughly 10 active tasks, prune/reorder it rather than letting it become a second backlog.

## Branches and commits

- **`develop` is where ordinary work happens.** Commit to it directly.
- **`main` is production.** Update it only through a pull request from `develop` when the project owner asks for a release.
- Use a short-lived branch only when a risky or far-reaching change genuinely needs isolated review.
- Keep each commit to one coherent change.
- Run relevant checks before committing.
- Never knowingly leave `develop` broken.
- Commit messages should describe the change; Linear issue IDs are not required.

## Blockers and ambiguity

Stop and surface the problem when:

- current requirements conflict;
- a choice materially changes product behaviour or architecture;
- required credentials, permissions, assets or dependencies are unavailable;
- the requested action would destructively overwrite another contributor's work;
- a linked requirement cannot be interpreted or verified safely.

Do not invent scope from legacy planning documents.

## Completion standard

Work is ready when:

- the selected todo scope is implemented;
- linked requirements/acceptance behaviour are satisfied or remaining gaps are explicit;
- relevant checks pass;
- planning/design documentation is updated only where needed;
- another agent can continue without reconstructing the task from chat history.
