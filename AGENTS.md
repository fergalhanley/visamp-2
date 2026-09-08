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
- **Slack #progress** is the progress feed for concise agent updates, blockers,
  questions, and handoffs in the Visamp workspace. Resolve the channel through the
  connected Slack tools before posting. Do not rely on Slack as the permanent
  record of requirements or decisions.
- If these sources disagree, stop and ask for clarification. Do not silently
  choose one interpretation.

## Before starting work

1. Work from a Linear issue whenever an issue has been provided.
2. Read the complete issue, its acceptance criteria, dependencies, and linked
   decisions before changing code.
3. Confirm that prerequisite work is complete. If it is not, report the blocker
   rather than implementing around an unresolved dependency.
4. Move the issue to **In Progress**, or ask the project owner to do so if the
   agent cannot update Linear.
5. Post a concise progress update in the designated Visamp Slack channel:

   ```text
   STARTING <ISSUE-ID> — <short description>
   ```

6. Create or use a dedicated branch named:

   ```text
   <issue-id-lowercase>-<short-description>
   ```

## While working

- Stay within the Linear issue's stated scope.
- Treat acceptance criteria as the definition of completion.
- Do not make unrelated refactors or opportunistic changes in the same branch.
- Preserve existing user or agent work. Never discard changes merely because
  they are outside the current task.
- Add or update tests for changed behaviour where practical.
- Run the smallest relevant checks during development and the full relevant
  verification before handoff.
- Record durable product or architectural decisions in Linear and, when they
  affect future implementation, in repository documentation. Slack alone is
  not a sufficient decision record.
- Reference the Linear issue ID in branch names, commits, and the pull request.
- When work overlaps another active issue, coordinate through Linear and post
  the conflict in Slack before editing the shared area.

## Progress updates

Slack updates are intended to let the project owner track agent activity without
reading every commit. Post an update when:

- work starts;
- a meaningful milestone is reached;
- the task becomes blocked;
- scope or acceptance criteria need clarification;
- a pull request is ready for review.

Keep routine updates short. Put detailed technical reasoning, requirements
changes, and durable decisions in Linear or repository documentation.

Use these formats:

```text
PROGRESS <ISSUE-ID> — <completed milestone>; next: <next step>
BLOCKED <ISSUE-ID> — <blocker>; needs: <specific decision or action>
READY <ISSUE-ID> — <PR link>; <verification summary>
```

## Pull requests and handoff

A pull request must:

- link the Linear issue;
- explain what changed and why;
- identify any deliberate deviations from the issue;
- list tests and checks performed;
- mention known limitations or follow-up work;
- avoid claiming completion when acceptance criteria remain unmet.

When the implementation is ready:

1. Open a pull request against `main`.
2. Move the Linear issue to **In Review**, or ask the project owner to do so.
3. Post the `READY` update in Slack.
4. Leave the issue open until its acceptance criteria have been verified.
5. Do not merge or mark the issue **Done** unless authorised by the project
   owner or the task instructions explicitly grant that authority.

## Blockers and ambiguity

Stop and request clarification when:

- requirements conflict;
- a choice would materially change product behaviour or architecture;
- required credentials, permissions, assets, or dependencies are unavailable;
- the requested action is destructive or would overwrite another contributor's
  work;
- acceptance criteria cannot be verified.

When blocked, preserve the work in a branch, describe the current state in the
Linear issue, and post a `BLOCKED` update in Slack.

## Completion standard

Work is ready for review only when:

- the implementation matches the issue scope;
- every acceptance criterion is satisfied or explicitly identified as pending;
- relevant tests and checks pass;
- documentation is updated where behaviour or architecture changed;
- the pull request and Linear issue contain enough context for another agent or
  human to continue without reconstructing the work from chat history.
