# Part-studio tool guidance

> 状态：本地验收完成，未发布
>
> 更新时间：2026-09-14
>
> 适用范围：底部工具名称、插接口指针与操作提示
>
> 替代关系：补充独立插接口工具；不改变几何、保存及发布状态

## Plan

- [x] Add failing tests for toolbar hover/focus names and insertion guidance at empty, interior and outer-edge positions.
- [x] Reuse the common tooltip and outer-edge hit test. Show concise in-canvas guidance, highlight the real board edge and change the cursor at valid starts.
- [x] Run target tests, harness, full CI and real-browser checks at 390×844, 768×1024 and 1440×900. Inspect screenshots and record results.

## Boundaries

Continue the existing `flightwoodx-insert-interface` worktree and preserve its uncommitted insertion implementation. No geometry/API changes, new dependencies, commit, push or deployment. The Browser plugin is unavailable; use repository Playwright.

## Implementation

The existing common tooltip now supports top placement, keyboard descriptions and Escape/click dismissal. Every bottom icon, including disabled actions, displays a short name; the rectangular cut is explicitly named 矩形开孔. The snap checkbox also explains its grid action. No native-title duplicate is shown.

The insertion tool highlights the real outer contour and exposes a snap marker with a 12px mouse acquisition radius (22px for touch). Hover and pointer-down share the same helper. The cursor is a crosshair near the edge and not-allowed elsewhere. A small pointer-transparent instruction stays within the visible canvas, explains empty/invalid starts and dragging, and disappears after creation. Geometry, width, save data and tool-reset behavior are unchanged this turn.

## Verification

- The three new unit tests failed before implementation; all 70 targeted page/canvas tests now pass.
- Final full CI: 764 tests passed (123 repository, 88 shared packages, 466 web, 87 API), harness, types, lint, audit and production build. Log: `/tmp/fwx-tool-guidance-ci-final-20260914.log`. Existing Fast Refresh and Blockly chunk-size warnings remain; no known dependency vulnerabilities.
- Initial nine-suite browser run: 40/41 passed. It caught the phone instruction scrolling offscreen after focusing a bottom tool. A sticky instruction within a pointer-transparent overlay fixed this without changing stage height or toolbar positions. This failure is retained in `/tmp/fwx-tool-guidance-browser-20260914.log`.
- Final built-site regression: all 6 insertion/guidance tests passed in 22.5 seconds across 390×844, 768×1024 and 1440×900. Covers every hover name including disabled actions, focus/Escape/click dismissal, invalid empty/interior starts, 8px-outside edge acquisition, cursor/anchor agreement, constant layout, creation, undo, failed outward drags and real tablet touch. No page, console or network errors in the guidance flow. Log: `/tmp/fwx-tool-guidance-browser-final-20260914.log`.
- Earlier 38 existing drawing regressions all passed, including true API save/read-back and account restoration; after the final CSS-only phone correction, the affected insertion flows were rerun with all 3 guidance flows rather than repeating unaffected suites.
- Final three-size screenshots inspected at `/tmp/fwx-tool-guidance-final-20260914/insertion-guidance-{390,768,1440}.png`.
- Local preview remains `http://127.0.0.1:4174/part-studio`, API 3001 and isolated Mongo database `fwx_e2e_insert_20260914`. Port 4173, production and prior uncommitted work remain untouched. To undo this turn, revert only its tooltip/guidance hunks; retain the prior insertion feature.
