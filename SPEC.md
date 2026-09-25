# lofi-viewer — Product & Technical Spec

## 1. Overview
lofi-viewer is a browser-based viewer that loads any 3D model (glTF/GLB, OBJ,
FBX) and renders it through a PlayStation-1-era pipeline: low internal
resolution, per-vertex jitter/snapping, affine (non-perspective-correct)
texture mapping, reduced/dithered color depth, and optional CRT-style
post-processing. Goal: drag in a modern model, preview and export it looking
like a PS1-era game asset.

## 2. Recommended stack
- Vite + TypeScript — fast dev loop, no framework overhead needed for this UI
- three.js for scene graph, loaders, and WebGL rendering
- three.js `EffectComposer` + custom `ShaderPass`es for the PSX render
  pipeline and post-fx
- No CSS framework — hand-written CSS custom properties per §3 (the UI is
  small and fully custom, and the monochrome constraint is easiest to enforce
  by hand)

**If this repo already has a different stack in place (React, Vue, Svelte, a
different renderer), adapt this spec's behavior to that stack rather than
rewriting the repo.** The choices above are a default for a from-scratch build
only — inspect `package.json` and existing source first.

## 3. Visual design system

### 3.1 Color tokens — grayscale only
Two modes, swapped by the Invert button. Implement as CSS custom properties on
the root (e.g. toggled via `data-theme="dark"|"light"` on `<html>`):

**Dark (default)**
```css
--c-bg: #131217;
--c-panel: #18171e;
--c-panel-alt: #201f27;
--c-border: #28272f;
--c-border-strong: #3a3940;
--c-text: #f0f0ee;
--c-text-dim: #98979c;
--c-text-faint: #5c5b61;
--c-accent: #f0f0ee;   /* same value as --c-text: no hue anywhere */
```

**Light (inverted)**
```css
--c-bg: #f5f5f3;
--c-panel: #ffffff;
--c-panel-alt: #ebebe9;
--c-border: #d6d6d4;
--c-border-strong: #b9b9b7;
--c-text: #111112;
--c-text-dim: #5c5c60;
--c-text-faint: #8c8c8f;
--c-accent: #111112;
```

These tokens apply to: top bar, sidebar (background, border, text, buttons,
inputs, selects, switches, sliders, tabs). They do **not** apply to: the
render canvas, its HUD overlay text, or the floating camera toolbar — those
stay a fixed near-black regardless of invert state (`#0b0a0f`-ish background,
`#e6e6e4` HUD text), because they represent the rendered image itself, not app
chrome. Think of it like Blender's light/dark UI theme: it never recolors the
render preview.

### 3.2 Typography
- Display / technical labels / HUD: **Space Mono** (Google Fonts), 400 & 700
- Body / control labels: **IBM Plex Sans** (Google Fonts), 400/500/600/700
- No Inter, Roboto, or Arial.

### 3.3 Layout
- Reference desktop size: 1440×900. Design responsively down to ~1024px; below
  that, collapse the sidebar behind a toggle rather than shrinking controls
  illegibly.
- **Top bar**: 58px fixed height. Left: 3×3 pixel logo mark (squares
  alternating `--c-accent` / `--c-border-strong`) + wordmark "lofi-viewer"
  (mono, 15px, 700) + small tagline (10px, `--c-text-faint`). Right: current
  filename badge, Invert button, Fullscreen button.
- **Main area**: flex row. Viewport = `flex: 1` (fills remaining space).
  Sidebar = fixed 376px, border-left.
- **Sidebar**: tab strip (CSS grid, 3 columns × 2 rows — Import / Render /
  Environment on row 1, Camera / Effects / Export on row 2) + scrollable panel
  content below. Only one panel is visible at a time — tabs, not an accordion,
  so each panel stays short and scannable instead of one long scroll.
- **Viewport**: WebGL canvas fills the area. Overlaid (doesn't affect layout):
  a perspective floor grid, HUD text top-left (`SCENE` / `TRIS` / `RES` /
  `FPS`, live values, monospace), and a floating pill toolbar bottom-center
  (orbit / pan / frame — divider — turntable play/pause + speed readout —
  divider — Persp/Ortho segmented control).

### 3.4 Component patterns
- **Row**: flex, `justify-content: space-between`, ~11px vertical padding, 1px
  top border (`--c-border`) — omitted on the first row in a group.
- **Switch**: 34×19px pill. Native `<input type="checkbox">` visually hidden;
  track + thumb drawn via sibling elements. `--c-accent` fill when checked.
- **Slider**: native `<input type="range">`, `accent-color: var(--c-accent)`,
  thin 3px track.
- **Segmented control**: 2–4 `<button>`s in a bordered flex row; the active
  one is filled `--c-accent` / `--c-bg`.
- **Section label**: 10px Space Mono, uppercase, `letter-spacing: 0.12em`,
  `--c-text-faint`.
- **Buttons**: ghost by default (transparent fill, `--c-border` outline);
  primary = filled `--c-accent` / `--c-bg`, used once per panel for the single
  main action (Load Model, Snapshot PNG).

### 3.5 Invert button
- Icon: a circle outline with the left half filled — the standard "invert"
  glyph. Flip it horizontally (`transform: scaleX(-1)`) when active, as a
  small extra affordance.
- Lives top-right of the top bar. `aria-label="Invert interface"`,
  `aria-pressed` reflects state.
- Persist the choice in `localStorage` so it survives reload.

## 4. Panel spec — controls and how to actually implement them

### 4.1 Import
| Control | Behavior |
|---|---|
| Load Model | File picker / drag-drop, accepts `.glb`/`.gltf`/`.obj`/`.fbx` → route to `GLTFLoader` / `OBJLoader` / `FBXLoader` (three.js `examples/jsm/loaders`) by extension |
| Load Texture Map | Applies a loaded image as the active material's `map`; respect the current Texture Filter setting (§4.2) on load |
| Load HDRI / Skybox | `.hdr` via `RGBELoader` → `PMREMGenerator` → `scene.background` / `scene.environment` |
| Preset (select) | Loads a bundled scene config (lighting + camera + render settings as JSON) |
| Clear Scene | Disposes geometries/materials/textures, resets to empty state. Gate behind a confirm step — no color-coding for "danger" since the UI is monochrome |

### 4.2 Render — the core feature, this is what makes it look PSX
| Control | Implementation |
|---|---|
| Render Scale (Pixelation) | Render the scene into a low-resolution `WebGLRenderTarget` (e.g. 320×240 at 1×), then blit to the full-size canvas with `NearestFilter`. This produces the blocky look — don't fake it with a CSS filter |
| Vertex Snap + Snap Precision | In the vertex shader, after projection, snap `gl_Position.xy` to a grid (`floor(pos * precision) / precision`) before the perspective divide — reproduces the PS1's lack of subpixel precision ("wobbly" geometry) |
| Color Depth (15-bit / 24-bit) + Dither Pattern | Post-process shader: quantize each channel to 5 bits for 15-bit mode, applying an ordered Bayer 4×4 dither matrix before quantization to avoid visible banding |
| Affine Texture Warp | Custom `ShaderMaterial` that interpolates UVs linearly in screen space instead of perspective-correct — skip the `1/w` correction three.js applies by default. This produces the classic "warping texture" look on large flat surfaces |
| Texture Filter | `THREE.NearestFilter` vs `THREE.LinearFilter` on `texture.magFilter` / `minFilter` |
| Wireframe Overlay | Second render pass with `material.wireframe = true`, composited additively over the shaded pass |
| Backface Culling | `material.side = THREE.FrontSide` vs `THREE.DoubleSide` |

### 4.3 Environment
| Control | Implementation |
|---|---|
| Background (Color / Gradient / Image / None) | `scene.background` = `THREE.Color` / a generated gradient texture / a loaded image / `null` |
| Ambient / Key Light Intensity + color | `AmbientLight` + `DirectionalLight`; `.intensity` and `.color` bound to controls |
| Exposure | `renderer.toneMappingExposure` |
| Fog Density + Color | `THREE.FogExp2(color, density)` on `scene.fog` |

### 4.4 Camera
| Control | Implementation |
|---|---|
| Projection | Swap `PerspectiveCamera` / `OrthographicCamera`, preserving position and target |
| Field of View | `camera.fov` + `updateProjectionMatrix()` |
| Turntable + Rotation Speed | `OrbitControls.autoRotate` + `.autoRotateSpeed` |
| Auto-Frame on Load | Compute the model's bounding box on load; position camera and controls target to fit it |
| Reset View | Restore the initial camera transform |

### 4.5 Effects — post-processing chain, applied after the PSX render-target pass
| Control | Implementation |
|---|---|
| CRT Curvature | Barrel-distortion `ShaderPass` on the UV lookup |
| Scanlines | Fragment shader: darken every other row via `mod(gl_FragCoord.y, 2.0)` |
| Vignette | Radial-darkening shader pass |
| Chromatic Aberration | Sample the R/G/B channels at slightly offset UVs |
| Film Grain | Per-frame random noise added in a shader pass |
| Color Grade | LUT-style pass with presets (None / Warm VHS / Cold CRT / Sepia) as small precomputed color matrices |
| Bloom | three.js `UnrealBloomPass` |

### 4.6 Export
| Control | Implementation |
|---|---|
| Snapshot PNG | Render at the selected resolution multiplier, `canvas.toBlob('image/png')`, trigger a download |
| Record Turntable (WebM / GIF) | `canvas.captureStream()` → `MediaRecorder` for WebM; for GIF, encode captured frames client-side (e.g. `gif.js`) |
| Duration | Seconds of turntable rotation to record |
| Copy Settings as JSON | Serialize the full control state to the clipboard |
| Share Preset Link | Encode the settings JSON into a URL query param (base64) — restores state on load |

## 5. State
One reactive store (a plain object with subscribers, or a small lib like
`nanostores` — avoid pulling in a full framework just for this) holds every
control's value, `activeTab`, and `inverted`. Every panel control reads and
writes this store directly; the renderer subscribes and applies changes on the
next frame. This makes "Copy Settings as JSON" and "Share Preset Link" trivial
— just serialize the store.

## 6. Accessibility
- Every checkbox / slider / select has a real `<label for>`.
- Icon-only buttons (Invert, Fullscreen, Orbit, Pan, Frame, Play) get an
  `aria-label`.
- Tab-strip buttons use `aria-pressed`, not just a visual highlight.
- Body text stays ≥ 4.5:1 contrast against its background in both theme modes
  — the tokens in §3.1 already satisfy this; don't lighten/darken them further
  for "polish."

## 7. Suggested file structure
```
src/
  main.ts
  scene/
    setup.ts             # renderer, scene, camera bootstrap
    loaders.ts            # model/texture/HDRI loading
  pipeline/
    psxRenderTarget.ts     # low-res render target + upscale blit
    shaders/
      vertexSnap.glsl.ts
      affineWarp.glsl.ts
      dither.glsl.ts
      crt.glsl.ts
      scanlines.glsl.ts
      vignette.glsl.ts
      chromaticAberration.glsl.ts
      grain.glsl.ts
      colorGrade.glsl.ts
  ui/
    store.ts               # reactive state store
    topbar.ts
    sidebar/
      tabs.ts
      importPanel.ts
      renderPanel.ts
      environmentPanel.ts
      cameraPanel.ts
      effectsPanel.ts
      exportPanel.ts
    theme.ts                # invert toggle, token application
  export/
    snapshot.ts
    record.ts
    preset.ts
styles/
  tokens.css                 # §3.1 as CSS custom properties
  components.css
docs/
  SPEC.md                    # this file
```

## 8. Definition of done, per panel
- [ ] Every control in §4 is wired to the store and visibly affects the render
      or export in real time — no dead controls
- [ ] UI matches §3 exactly: no color outside the grayscale tokens (scene
      color pickers excepted)
- [ ] Invert button flips top bar + sidebar only; viewport, HUD, and floating
      toolbar stay fixed
- [ ] All controls are real, labeled form elements (§6)
- [ ] Layout holds down to ~1024px width without clipped or overlapping
      controls
- [ ] Snapshot / record / share-link export actually produce a working
      file or link, not stubs
