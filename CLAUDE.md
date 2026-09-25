# lofi-viewer — Agent Instructions

This repo is **lofi-viewer**: a web-based tool that loads arbitrary 3D models and
renders them through a PS1/PSX-style pipeline (low internal resolution, vertex
snapping, affine texture warping, dithered color, CRT-style post-fx).

## Before you write any code
1. Read `docs/SPEC.md` in full — it's the source of truth for features, visual
   design tokens, and the recommended rendering approach.
2. Read **"Existing codebase"** below — this repo is not a blank slate.
3. Check what's already in this repo (`package.json`, existing components/shaders)
   before assuming a stack. If nothing exists yet, default to the stack in
   `docs/SPEC.md` §2.
4. Treat the six panel names — **Import / Render / Environment / Camera / Effects
   / Export** — and their controls as fixed product vocabulary. Don't rename or
   reorganize them without asking first.

## Existing codebase — audit before touching anything
This repo already has a working build: roughly 60% of the features in
`docs/SPEC.md` §4 exist and function, but the UI around them is messy and
doesn't match §3. This is a **refactor, not a rewrite**.

1. **Inventory first.** Before changing or deleting anything, go through the
   repo and produce a short report (in your reply, not a new file) listing:
   - which controls/features from `docs/SPEC.md` §4 already exist and work
   - which exist but are broken/partial
   - which don't exist yet
   - where the actual rendering logic lives (model loading, scene setup, any
     shader/render-target code) vs. where the UI glue lives
2. **Preserve working rendering logic.** Three.js scene setup, loaders, and
   any shader/render-target code that already works is expensive to redo and
   cheap to keep — extract and reuse it even if the file it's currently sitting
   in is messy. Don't delete a working feature just because the component
   around it needs a rewrite.
3. **Rebuild the UI layer to match `docs/SPEC.md` §3**, panel by panel (start
   wherever the existing UI is furthest from spec — usually the fastest win).
   Wire each rebuilt panel back to the existing logic rather than
   reimplementing that logic too.
4. **Confirm before deleting.** If a file looks unused, verify it's actually
   dead code (not referenced anywhere) before removing it — don't assume messy
   means unused.
5. Only after the inventory in step 1, propose an order of work (which panel
   to refactor first) and confirm it makes sense before doing a large pass.

## Non-negotiable constraints
- **Monochrome UI only.** No hue anywhere in the application chrome (top bar,
  sidebar, buttons, text, borders). Grayscale ramp from `docs/SPEC.md` §3.1, in
  two modes (default dark / inverted light) driven by the Invert button, top-right.
- **The 3D viewport itself does not invert.** Only the surrounding chrome (top
  bar + sidebar) responds to the Invert toggle. The render canvas, its HUD
  overlay, and the floating camera toolbar stay fixed dark — they represent the
  rendered output, not app chrome.
- Scene-content color pickers (background color, light color, fog color) are
  exempt from the grayscale rule — those set properties of the user's scene,
  not the UI.
- Real form controls only: `<button>`, `<input>`, `<select>`, `<label for>`.
  Never a `div` with `onClick` standing in for a control.
- Every slider/toggle must actually drive the renderer — this is a functioning
  tool, not a static UI shell. Don't ship a control that doesn't do anything yet.

## Reference
- UI layout mockup (structure, spacing, control types — visual source of truth):
  https://claude.ai/artifact/75PocbjbokVZtw89ZQJqhn
- Full feature + shader spec: `docs/SPEC.md`

## Definition of done
See `docs/SPEC.md` §8 before calling any panel "finished."
