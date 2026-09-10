# Linear task pickup for coding agents

Tracking: [VIS-70](https://linear.app/visamp/issue/VIS-70/configure-linear-task-pickup-for-codex-cli-and-claude-code).

This repository connects **Codex CLI** and **Claude Code** to Linear for interactive
development. The root [AGENTS.md](../AGENTS.md) remains the operating protocol.
Connecting MCP provides tools; it does not launch agents or schedule task pickup.

## Connection setup

The repository contains these shared, token-free definitions:

| Client | Configuration | Server name |
| --- | --- | --- |
| Codex CLI | [.codex/config.toml](../.codex/config.toml) | linear |
| Claude Code | [.mcp.json](../.mcp.json) | linear |

Both use Linear's official remote endpoint,
`https://mcp.linear.app/mcp`. No local MCP server or wrapper package is needed.
Each developer authenticates each client separately. The ChatGPT connection used to
create the backlog does not establish these local OAuth sessions. Credentials stay
in the client's local credential storage, not these files.

Start in the repository root after checking out the tooling branch or pulling the
merged change. Use a current installed version of each CLI. If an existing local
or user configuration already defines `linear`, inspect its effective endpoint
before changing anything; do not overwrite unrelated MCP configuration.

### Codex CLI

1. Launch `codex` in this repository and complete the normal project-trust prompt.
   Project configuration loads only for trusted projects.
2. Exit to the shell and run:

   ```sh
   codex mcp list
   codex mcp login linear
   ```

3. Complete the browser sign-in for the **Visamp** Linear workspace. Start a fresh
   `codex` session and inspect `/mcp`, then run the read-only check below.

Do not add a second global definition when the project definition is already loaded.
The current setup does not require the historical `rmcp_client` feature flag.
If the server is missing, first check the working directory, project trust and
effective configuration.

Source: [OpenAI MCP configuration and OAuth](https://developers.openai.com/codex/mcp).

### Claude Code

1. Run `claude` from the repository root.
2. Review and approve the project Linear server when Claude Code prompts.
3. Run `/mcp`, select `linear` and complete its authentication flow.
4. Run the read-only check below. From the shell, `claude mcp get linear` also shows
   the server's configuration/status.

The root [CLAUDE.md](../CLAUDE.md) imports AGENTS.md. Continue to read any applicable
directory-level instructions, including those under `apps/web`.

Sources: [Linear's Claude Code setup](https://linear.app/docs/mcp) and
[Claude Code project MCP configuration](https://code.claude.com/docs/en/mcp).

## Verify access before taking work

Use this prompt in **each** client:

> Use the Linear tools to find the Visamp team and read VIS-70 in full. Report its
> title, status, project and blockers. Then list up to five unassigned Todo issues
> in that team, with priority and dependency status. Make no changes.

Expected team: **Visamp**, key **VIS**,
ID `f3dec5f9-a69e-465f-9078-81face897999`.
Expected repository: `fergalhanley/visamp-2`.
Inspect the live workspace; do not assume the import snapshot remains current.

The tool names may differ across client/server versions. Discover the available
equivalents for listing/searching issues, reading the full issue and relations,
updating status, recording claim/handoff details and reading comments.
Do not assume a successful configuration listing proves issue access.

For the first authorised task, verify write access by reading back its status
after the normal In Progress transition. Do not toggle unrelated issues as a test.
If access is missing, stop with the actual connection or permission error.

## Other delivery prerequisites

- Confirm GitHub access for this repository before code work: fetch and push
  `develop` through the existing Git authentication. Linear authentication does not
  grant GitHub access. Ordinary work needs no pull request; a release pull request
  from `develop` to `main` is opened only when the project owner asks for one, and
  needs an authenticated GitHub tool or the GitHub CLI.
- Send the progress messages required by AGENTS.md to **#progress** in Fergal's
  Visamp Slack workspace. Fergal created and selected this channel. Resolve that
  channel in the connected workspace before posting; confirm the local client's
  Slack access and posting authorisation. Linear OAuth does not connect Slack.
  Do not claim a post was sent unless the Slack tool confirms it.
- Use a separate worktree for each active task, all on `develop`. Do not share a
  working tree with another running agent. AGENTS.md allows two long-lived branches
  and no others, so there is no per-issue branch to isolate.

## Select eligible work

When Fergal provides an issue ID, inspect that issue instead of selecting another.

For a request to pick the next task:

1. Query the Visamp team's **Todo** issues, following pagination as needed.
   Consider only unassigned issues in a Visamp project. Exclude the starter tutorial
   issues, Backlog, roadmap work not moved to Todo, In Progress and In Review.
2. Order by explicit priority: Urgent, High, Medium, Low, then No priority.
   Break equal-priority ties by the numerical VIS issue number.
3. Read each candidate in full, including comments, blocking relations and linked
   decisions. Check that blockers are actually complete and scope is actionable.
   A canceled prerequisite or unresolved product choice is not automatically satisfied.
4. Skip work owned by Fergal or another person unless they explicitly delegate it.
   Preserve existing assignees. Local CLI agents are not artificial Linear users.
5. Select one eligible issue. If none is eligible, report the specific missing input
   or prerequisite; do not move Backlog work into Todo or reinterpret open decisions.

The source backlog contains independent research/configuration work as well as
completion gates. Follow the live issue's conditional-dependency notes, especially
for client versus server export, initial deployment and post-deployment validation.

## Coordinate and record pickup

For simultaneous agents, Fergal or one coordinator must dispatch **different issue
IDs**, one claim at a time. Do not launch two generic "pick next" requests concurrently.

For a user-authorised pickup:

1. Immediately re-read the issue, status, assignee and recent claims before mutation.
   Stop if another session has claimed it or the issue is no longer eligible.
2. Move it to **In Progress**, preserving the assignee.
3. Record a claim in the issue with agent client, a unique session identifier,
   working branch and checkout/worktree. Do not include credentials.
4. Read it back to confirm the status and claim, then follow AGENTS.md's STARTING
   and branch requirements.

The branch is `develop`. Name a short-lived branch in the claim only in the exception
AGENTS.md describes — a change risky or far-reaching enough that someone asked to see
it first — and merge it into `develop`, never into `main`. A claim record can be:

```text
CLAIM — client=Codex CLI; session=<unique session ID>
Branch: develop
Worktree: <local worktree>
Scope: <one-sentence accepted task>
```

Claude Code uses the same format with its own client name and session ID.
A read/update/read sequence is **not an atomic lock**. The serialized dispatch rule
prevents the usual same-account race; these configs do not implement a distributed
claim service. If overlapping claims are found, stop and coordinate before editing.
An abandoned In Progress issue needs an explicit release or handoff before reuse.

## Implement and hand off

Follow all applicable AGENTS.md instructions and the issue's acceptance criteria.

- Keep scope, dependencies and decisions in Linear, and technical changes in GitHub.
- Record actionable blockers and validation outcomes. Do not silently replace open
  choices with implementation assumptions.
- Run the relevant checks, then commit to `develop` and push. There is no pull
  request for ordinary work; what is committed has to stand on its own.
- Move the issue to **In Review** and record the commit, the validation performed and
  any limitations.
- Complete the required progress/handoff updates using the authorised destination.
- Stop at review. Releasing to `main` and marking Done still require the existing
  authorisation. Connecting MCP does not change approval settings or grant it.

## Pickup prompts

For one agent at a time:

> Read AGENTS.md and agents/linear-workflow.md. Pick the highest-priority eligible,
> unassigned Todo issue in the Visamp team. Check all blockers and recent claims,
> record your claim and move it to In Progress. Preserve human ownership, implement
> only the agreed scope, validate it, then commit to develop and push. Record the
> commit in Linear and move the issue to In Review. Do not open a release pull
> request or mark Done. Stop if required inputs or delivery integrations are
> unavailable.

For multiple agents, send each a distinct issue:

> Read AGENTS.md and agents/linear-workflow.md. Work only on VIS-<number>. Check its
> prerequisites and existing claims, then record your claim, use a separate worktree
> and follow the implementation and In Review handoff process.

Replace the placeholder with an actual, eligible issue. These prompts do not
authorise agents to take work assigned to Fergal without explicit delegation.

## Setup validation status

Fergal reports local authentication is complete. The read-only smoke check above
still needs recorded results from each client; authentication alone does not prove
issue read/write access. The Slack destination is #progress; local Slack integration
and a successful authorised post remain to be verified. Track activation evidence
on VIS-70.
