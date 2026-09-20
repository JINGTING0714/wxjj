# Mobile UX review — 2026-09-19

## Scope and evidence

Reviewed the current Collage and image Watermark workspaces, shared mobile details drawer,
navigation breakpoint, and desktop layout. No PNG Cleaner, Watermark FX, image-processing
algorithm, or persistence schema changes. Existing controls are reused in on-demand drawers.

Browser checks used a fresh isolated local vault, real image imports, and Chromium/Edge
touch emulation. They did not access the user's vault. Widths: 360, 375, 390, 414, 430,
768 (844 px height); desktop: 1440 × 900. This is not physical iOS/Safari certification.

## Findings before fixes

1. **High — Collage preview collapsed.** With two imported images the board measured
   approximately 4 × 7 px. Absolute-positioned image children did not provide an intrinsic
   size to the mobile `width: auto` grid. The board now has an explicit ratio-dependent
   width inside a 38dvh preview region; export pixel dimensions are unchanged.
2. **High — Tabs still exposed long Collage forms.** At 390 px, Layout measured 810 px
   and Numbering 794 px. Main panels now contain quick controls; original precise layout,
   number styles/export format, source management and queue positioning open in drawers.
3. **High — Pause inherited disabled state.** The mobile pause button was inside the
   processing-disabled fieldset. Primary actions now sit outside it; start/resume retain
   readiness/busy guards. Drawer controls retain processing-disabled guards despite portals.
4. **Medium — Watermark tabs started below the initial viewport.** At 390 px the tab bar
   started at about y=877 and the adjustment page was about 1708 px tall. Workshop headers
   are compact, preview and tabs remain together while scrolling, and adjustment controls
   use a compact two-column arrangement. Details remain on demand.
5. **Medium — Preview sizing could constrain width and height independently.** The mobile
   watermark surface now derives both dimensions from the available region and composition
   aspect ratio. The tested wide image preserved its ratio within 0.2% (pixel rounding).
6. **Medium — Fullscreen-to-desktop could retain body scroll lock.** Fullscreen now exits
   on the desktop breakpoint or Escape; cleanup restores the prior overflow value.
7. **Medium — Source list nested scrolling inside a drawer.** The list's own height cap
   and overflow are removed only inside the mobile drawer; the drawer body owns scrolling.

## Verified after fixes

At 390 × 844, with the same two-image baseline:

| Active panel | Collage panel height | Watermark panel height |
| --- | ---: | ---: |
| Images / Preview | 276 px | 270 px |
| Layout / Watermarks | 165 px | 290 px |
| Numbering / Adjust | 251 px | 394 px |
| Output | 240 px | 129 px |

Natural document scrolling remains: Collage pages measure about 942–1053 px and Watermark
pages 1035–1300 px, including header, preview, controls and bottom clearance. The objective
is one active panel plus on-demand details, not a non-scrolling viewport or hidden controls.

- 48 width/tab combinations: exactly one active panel, noncollapsed bounded preview before
  tabs, no horizontal page overflow, no nested vertical workspace scroll container.
- Four Collage drawers: open, visible close control within viewport, close successfully.
  After animation, drawer bottom y=844; close button bottom y=828 at 390 × 844.
- Actual import of 42 images, start generation and click enabled Pause: passed.
- Watermark advanced drawer fits viewport and restores body scrolling after closing.
- Watermark fullscreen: visible exit, Escape exit, desktop-resize exit and scroll restoration.
- Touch swipe over default canvas: document scrollY changed from 220 to 422.
- Touch on an unobscured scale slider: value changed from 0.6 to 4.315.
- Desktop screenshot inspected; Collage columns measured 774 px + 310 px, Watermark
  retained two columns; mobile tabs/navigation hidden.
- No uncaught browser page errors in the completed review run.

## Automated checks

- Existing vault/import/composition/video suite: **37 passed, 0 failed**.
- TypeScript no-emit check: passed.
- Production build: passed. Existing bundle-size warning remains.
- Relevant-component lint: **not clean**. 26 baseline diagnostics became 25; the unlabeled
  Collage numbering toggle was fixed. Remaining file/rule counts match the baseline
  (hook dependencies, compiler/ref warnings, existing accessibility/image/video warnings).
  Do not treat the remaining lint failure as a passing lint run.
- `git diff --check`: passed.

## Reproduction

`tests/mobile-ux.review.mjs` runs against a local preview and needs an available Playwright
installation. Optional environment variables: `PRISM_PLAYWRIGHT_MODULE` (module entry file path),
`PRISM_BROWSER_PATH` (browser executable), `PRISM_REVIEW_URL` (defaults to localhost:3000).
Run from the repository root. Reports and screenshots go into ignored `work/`.

## Remaining coverage limits

- Real-device safe-area/notch behavior, Safari gesture handling and on-screen keyboard
  resizing need device testing. Existing safe-area padding is preserved.
- This focused fix does not certify every asset-library Dialog or the video workflow
  with a large real video batch; shared mobile styling applies, but those paths need
  separate representative-data review.
- Very large watermark layer collections and short landscape viewports have not been
  exhaustively tested. Do not claim all mobile UX cases are resolved by this review.
