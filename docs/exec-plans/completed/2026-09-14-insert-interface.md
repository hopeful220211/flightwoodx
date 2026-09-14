# Insert-interface drawing tool

> 状态：已完成本地验收，未发布
>
> 更新时间：2026-09-14
>
> 适用范围：二维插接口工具、共享孔槽校验与本地回归
>
> 替代关系：补充现有孔槽定义，不替代已完成发布记录

## Scope

Add a separate bottom-toolbar 插接口 tool, distinct from the ordinary rectangular cut. Start near the actual outer boundary and drag inward, snap to horizontal/vertical, keep the slot 2 mm wide, derive its bottom-center and entry direction, then return to Select. Reuse persisted jointGuides; do not add automatic assembly, payments, deployment or unrelated changes.

## Implementation

- [x] Red tests: boundary anchoring, four directions, curved edges, invalid gestures, separate icons and single-use tool.
- [x] Implement boundary snapping, fixed-width insertion tool and bottom marker. Keep ordinary rectangular cuts freely sized and existing through-slot mode available.
- [x] Preserve geometry validation and saved metadata on straight and curved board edges.
- [x] Run targeted tests, full CI, and browser mouse/touch checks at 390×844, 768×1024 and 1440×900.
- [x] Record evidence and provide local preview. No production publication this turn.

## Acceptance

The toolbar offers separate closed-rectangle and open-notch icons. A completed notch has a 2 mm width, editable length, a bottom-center mark and a recorded direction. Clicking away from an edge or dragging outward adds no invalid notch and gives a short actionable explanation. No toolbar overflow or canvas jump. Existing holes, undo/redo, selection and saved guides remain intact.

## Environment

Isolated worktree `/Users/nesty/Projects/flightwoodx-insert-interface`, branch `codex/insert-interface-2026-09-14`, base `7a46441`. Existing review and animation worktrees are untouched. Frozen dependency install reused the cache (2.9 s). The Browser plugin is unavailable; use repository Playwright for browser verification.

## Evidence

- Red tests reproduced the absent toolbar tool, missing fixed-width joint creation, and rejection of curved/sloping mouths before implementation.
- `FWX_TEST_MONGO_URI=mongodb://127.0.0.1:27028 pnpm run ci` passed: 761 tests (123 repository, 88 shared packages, 463 web, 87 API), type checks, harness, lint, security audit and production build. Log: `/tmp/fwx-insert-ci-final-20260914.log`. Existing Fast Refresh export warning and Blockly bundle-size warning remain; no known dependency vulnerabilities.
- Final small-screen inspector simplification was followed by a fresh web build and browser verification. Build: `/tmp/fwx-insert-web-build-final-20260914.log`.
- Eight part-studio Playwright suites: **38 passed in 1.8 minutes** against the final built site, including real tablet touch, shape/slot resizing, stable layout, legacy cuts, history, errors and actual API/database save/read-back. Separate geometry unit tests cover all four entry directions. Log: `/tmp/fwx-insert-browser-final-20260914.log`.
- Straight and curved edge slots were saved to dedicated local test accounts. Failed-save retry preserved geometry and direction; refreshing and a separate authenticated browser context restored saved guides. No production writes or existing user data edits.
- Final screenshots inspected at 390×844 and 1440×900; three-size screenshots and tool strips are in `/tmp/fwx-insert-interface-final-20260914/`. Phone toolbar uses two balanced tool rows with 44 px targets; menu and polygon controls sit above it without reducing the original drawing surface. Interface bottom markers remain visible over resize outlines.
- Preview: `http://127.0.0.1:4174/part-studio`, local API port 3001, isolated database `fwx_e2e_insert_20260914` on local Mongo port 27028. Existing port 4173 remains untouched. The Codex preview-open request was queued, not confirmed visible.

## Corrections during verification

An early test overlapped a build and observed temporary asset 404s; final browser runs began only after build completion. A save/read-back test initially captured the save-triggered GET while reloading; it now waits for the saved item and reads the reload response immediately. Phone regression caught a menu covering the toolbar and the shortened SVG surface bringing two anchors under the inspector; responsive menu spacing and preserved canvas height fixed both. Final 38-case run passed with no page/console failures.

## Release boundary

No commit, merge, push or deployment performed. Publish the web and API shared geometry runtime together in a later authorized release; an old API still rejects unequal-mouth curved-edge guides. This change defines and persists insertion slots, not automatic custom-part mating. Slots are horizontal/vertical in the drawing plane; 90-degree plate mating is a fixed design convention, not a newly implemented assembly operation.
