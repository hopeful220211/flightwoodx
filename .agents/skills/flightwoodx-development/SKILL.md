---
name: flightwoodx-development
description: Develop and verify functionality in the FlightWoodX repository. Use when Codex implements, fixes, refactors, reviews, audits, or restores FlightWoodX code, tests, contracts, APIs, UI, data flows, permissions, builds, or runtime behavior. Do not use for unrelated repositories, pure product discussion without repository work, or routine non-development tasks.
---

# FlightWoodX Development

## Start from current evidence

1. Resolve the repository root and read its `AGENTS.md`, `docs/index.md`, `ARCHITECTURE.md`, and `CURRENT_STATUS.md` completely before acting.
2. Discover any narrower `AGENTS.md` files that govern files in scope.
3. Read only the task-relevant RFCs, contracts, implementation, tests, migrations, and package scripts. Treat an RFC or historical report as intent or a dated snapshot, not completion evidence.
4. Inspect the current branch, commit, worktree list, and working-tree changes. Preserve user work and verify the checkout instead of relying on an older recorded baseline.
5. State the requested behavior, acceptance path, affected source of truth, and evidence boundary before choosing an implementation.

Use progressive disclosure: keep the three root documents as the mandatory entry point, then follow their paths into only the modules and RFCs needed by the task. Do not copy repository rules into task notes or invent a parallel source of truth.

## Isolate the work

- Perform write tasks only in a verified isolated worktree without unrelated changes. Reuse the intended task worktree when it already meets that condition.
- Use a dedicated `codex/` branch for each independent task. Add another worktree when tasks overlap, run in parallel, or the active checkout contains unrelated WIP.
- Coordinate before changing shared contracts, root configuration, or database structures in parallel work.
- Never discard, reset, or overwrite changes that are outside the task. Resolve exact targets before destructive or migration operations and require the authorization prescribed by the root rules.

## Freeze contracts before implementation

1. Identify the owning module and current formal data source.
2. For API or cross-end changes, define request, response, runtime validation, permissions, ownership, errors, ordering or pagination, and retry/idempotency behavior first.
3. Put cross-end contracts in the owning shared package. Update server enforcement, persistence mapping, clients, fixtures, and tests together; do not add another compatibility parser or duplicate DTO.
4. Keep deterministic product decisions in deterministic code. Stop conclusion-producing flight or manufacturing work when the evidence required by `AGENTS.md` is absent.
5. Limit refactors to the smallest coherent boundary needed for the requested behavior.

## Work test-first

1. Reproduce a defect with a failing test or encode the new acceptance condition before implementation whenever practical.
2. Test pure rules in their owning package. Test API changes for unauthenticated, unauthorized, invalid, successful, repeated, and concurrent paths as applicable.
3. Test web state and integrations for real data, explicit loading/error/empty states, refresh, retry, and failure preservation. Do not accept a silent mock, demo, or stale local fallback on a formal user path.
4. Add regression coverage at the lowest reliable layer, then add integration or browser coverage where component boundaries are part of the risk.
5. Do not weaken tests, lint, security checks, or ignore rules to obtain a passing result.

## Enforce front-end, back-end, and permission boundaries

- Treat browser-provided identity, ownership, visibility, scores, checks, and publish state as untrusted.
- Enforce authentication, role, resource ownership, state transitions, runtime input validation, and safe errors on the server. Cover the denied path as well as the allowed path.
- Keep the API in its current JavaScript/CommonJS boundary unless an approved migration changes it.
- Use shared runtime contracts and string IDs at API boundaries; keep persistence details inside the data layer.
- Preserve explicit failure feedback and user data through network, validation, save, and reload failures.
- Keep UI behavior accessible and usable at the target desktop, tablet, and mobile viewports. Follow the root documents for exact default viewports and product wording constraints.

## Verify the actual path

1. Run the narrowest relevant tests during iteration, then expand to affected packages and applications.
2. For UI or end-to-end behavior, start the actual application and exercise the real user path in a browser. Check the required viewports, console, network requests, persistence after refresh, error handling, and server-side permission denial. A screenshot or route existence alone is not acceptance evidence.
3. When external services are in scope, use isolated test accounts and objects, verify the remote read-back and cleanup/rollback path, and distinguish mocked checks from real integration evidence.
4. During development run affected tests. At completion reuse valid full CI for the exact current commit; for an unpushed local delivery run `pnpm run ci` once (it includes harness). Do not run harness twice or repeat local full CI merely to upload a completed version. Production still requires trusted cloud checks and their tested artifact. Report the exact failure and remaining verification when blocked.
5. For review-only work, stay read-only unless a change is requested. Report findings with file/line evidence, consequence, and verification; do not infer completion from code presence.
6. For restoration work, compare branches and worktrees before copying anything, preserve WIP, recover behavior behind a regression test, and verify compatibility or migration paths.

## Record status and deliver evidence

- For every upload, version update or production release, follow [the fixed release procedure](../../../deploy/automation/release-procedure.md). Start with `pnpm release`; use `pnpm release --publish` only after release authorization. Reuse valid evidence for the same exact commit and artifact, keep required checks, record phase durations, and do not restart unrelated development or duplicate full verification at production promotion.

- Apply the release procedure's timing targets and stop conditions: 2–5 minutes with valid evidence, 12–18 minutes with new full CI (targets, not measured guarantees). One frontend build, three isolated ordinary browser groups and one privacy group; all must pass. Production acceptance covers changed operations once and only layout differences at other viewports. Use compact summaries, no repeated unchanged polling output, no automatic failed-run retries and no unrelated agents or exploration during release.

- Update `CURRENT_STATUS.md` and relevant contracts or RFCs only when new evidence changes their stated status. Include the date, commit or working tree, commands, results, browser path and viewport, and remaining failures required by the root rules.
- Report changed files, automated results, real browser or integration evidence, migrations or environment changes, rollback concerns, unfinished work, and any claim the evidence does not support.
- Call work complete only when the repository completion definition is satisfied. Keep partial implementation, simulation, rule checks, manufacturing evidence, and real-flight evidence explicitly separate.
- Leave merge, deployment, data deletion, expanded publication, and engineering guarantees for explicit owner approval.
