# Part Studio workspace and inactive cutouts

> 状态：本地实现与验收完成，尚未发布
>
> 更新时间：2026-09-14
>
> 适用范围：零件绘制页面布局、非相交切除与对应回归
>
> 替代关系：补充本轮待发布功能，不覆盖既有制造或飞行证据边界

## Request and boundary

Keep non-intersecting cutouts editable without removing the valid board preview. Move drawing tools to a bottom floating toolbar and selected properties into a selection-only, non-modal overlay. Remove the add-shape and shape-picker row. Align 2D/3D headings and enlarge the drawing surface. Preserve millimetre geometry, 2 mm thickness, numeric validation, keyboard/touch interaction and real save flows.

Worktree: `flightwoodx-review`, branch `codex/home-hero-honors-2026-09-13`, base `ea1f8ca`. No API, shared-contract or production changes in this task. Pending release remains paused until this new candidate passes verification.

## Sequence

- [x] Read current code, policies and official Figma toolbar/property references.
- [x] Reproduce non-intersecting cutout failure; add model regressions and repair no-op subtraction.
- [x] Encode layout acceptance and migrate tests off removed controls.
- [x] Implement stable-height canvas, bottom toolbar, selection-only properties and aligned headers.
- [x] Verify mouse, touch, keyboard, numeric input, save/error/recovery and responsive layouts in real Chrome.
- [x] Run harness and full CI; update status and release handoff with exact evidence.

## Acceptance

Outside/tangent cuts preserve preview; partial overlap subtracts; invalid geometry remains rejected. Selection, polygon controls and error messages never move or resize the SVG. No extra page-header row, add-shape button or shape dropdown. Properties appear only with selection. Toolbar uses accessible targets, keeps focus/validation and does not cover active drawing area. Desktop headers align; small screens do not overflow. Publication is not implied by local tests.

## Implementation and evidence

- `model.ts`: exact zero-area material intersection is a no-op. Source cut geometry and all final geometry validation remain intact; no new contract.
- `PartStudioPage` / `SketchCanvas` / `SketchTools`: 64px aligned headings, independent SVG sizing, bottom icon toolbar, selection-only non-modal properties. Count and help move below the canvas. Property hiding preserves selection; invalid numeric drafts prevent unmounting. Drawing-tool selection clears the old selection so its inspector cannot intercept the next shape.
- Figma references: [canvas toolbar](https://help.figma.com/hc/en-us/articles/360041064174-Access-design-tools-from-the-toolbar), [right-side properties](https://help.figma.com/hc/en-us/articles/360039832014-Design-prototype-and-explore-layer-properties-in-the-right-sidebar). Selection-only visibility follows this user's request, not a claim that Figma hides all unselected properties.
- Red evidence: 12 geometry regressions failed before the no-op change; page and browser layout regressions failed on the old add button. Independent review found the mobile inspector obscured `n` / `ne` handles, reproduced in `/tmp/fwx-workspace-overlap-red.log`. Compact header and property hiding repaired it without weakening hit tests.
- Part Studio unit checks: 130 passed. Complete CI: 653 passed, API83 with zero skipped, harness/type/lint/security/build passed; `/tmp/fwx-workspace-ci.log`. No known dependency vulnerabilities; existing bundle-size warning retained.
- Target real-Chrome checks: 21/21, 46.9 seconds, `/tmp/fwx-workspace-browser.log`; 390/768/1440 widths, mouse/touch/keyboard, all8 handles and edge shapes, invalid dimensions, no-op/partial/interior cuts, shared wood and views. Screenshots `/tmp/fwx-workspace-ui-3gKrXQ/` checked by main and independent reviewer. Browser plugin not available.
- Build read-back: `index-DFFo3fFN.js`, `PartStudioPage-BCryjN-J.js`, local preview HTML matches. Whole-site real-Chrome suite 56/56 passed (3.2 minutes), including real API save failure/retry, custom-part placement, new-session restoration, broken references, official assembly/programming/simulation, homepage media/copy/contact/filing and dashboard controls; `/tmp/fwx-workspace-all-browser.log`. No unexpected browser errors in the checked paths. No production writes, API changes, migration or new dependencies. Restore only this task's diff; do not reset unrelated pending work.
