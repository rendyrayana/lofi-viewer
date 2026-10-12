# lofi-viewer

> From 3D scan to retro model and multi-color print. A browser tool that reduces scans to PS1-era models, renders them in the retro style, and exports multi-color 3D print files.

https://github.com/user-attachments/assets/a7d788d3-29b8-494b-99d8-9cc5905b555e

**[Live Preview](https://rendyrayana.github.io/lofi-viewer)** · **[Project Page](https://rendyrayana.my.id/lofi-viewer/)** · [Rendy Rayana](https://rendyrayana.my.id)

## Overview

lofi-viewer turns 3D-scanned real-world objects into PlayStation-era game assets and multi-color 3D prints. It runs entirely in the browser on the user's machine: load a textured scan, reduce it to a retro budget (triangles, texture size, palette), view it through a PS1-style renderer, and export it as a game-ready model, a standalone HTML viewer, a turntable video, or a multi-color print file for Bambu Studio, Orca Slicer or PrusaSlicer.

## Features

**Process (scan to retro asset)**
- Decimation to a triangle budget (meshoptimizer), with cleanup of duplicate faces
- New UV unwrap with skyline-packed charts, then rebake from the original scan texture
- Texture downsampling (nearest, average, edge-preserving)
- Palette reduction: PS1 15-bit, 4-bit and 8-bit CLUT, preset palettes, palettes extracted from the texture, or custom colors, with optional dithering
- One-click targets (PS1, N64, Saturn, Dreamcast, DOS, Game Boy, PICO-8, 3D print)

**Look (PS1-style rendering)**
- Low internal resolution, vertex snapping on the render pixel grid, affine texture warping, 15-bit color with screen dither
- Lighting, HDRI environments, fog and backgrounds; perspective or orthographic camera
- CRT curvature, scanlines, vignette, chromatic aberration, film grain, color grades, bloom
- Look presets for consoles and handhelds; compare view against the original scan

**3D print**
- Per-face filament colors sampled from the original scan, with adaptive subdivision for detail
- Smooth color edges, speck merging and a filament limit
- Watertight output with hole filling and a printability check
- Export as 3MF (Bambu Studio, Orca Slicer, PrusaSlicer) or OBJ + MTL (Bambu Studio color matching), with an in-viewport print preview

**Export and evaluation**
- GLB model, standalone HTML viewer, PNG snapshot
- Frame-accurate turntable video (MP4), optionally side by side with the original scan
- Processing metrics as JSON or CSV, and batch processing of many scans with the current settings
- Undo and redo, keyboard shortcuts (F frame, C compare, V viewer mode, P print preview)

## Requirements

- Node.js 18+
- Modern browser with WebGL2 support. Chrome or Edge recommended: MP4 recording uses WebCodecs

## Getting Started

```bash
git clone https://github.com/rendyrayana/lofi-viewer
cd lofi-viewer
npm install
npm run dev
```

Open `http://localhost:3000`. Drop in a model to get started.

## Tech Stack

| Library / Tool | Role |
|---|---|
| [Three.js](https://threejs.org) | 3D rendering, loaders, OrbitControls |
| [meshoptimizer](https://github.com/zeux/meshoptimizer) | Mesh decimation |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | Ray casting for texture rebake and print colors |
| [fflate](https://github.com/101arrowz/fflate) | 3MF packaging |
| [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | MP4 video files (with WebCodecs) |
| [Vite](https://vitejs.dev) | Dev server and build tooling |

## Status

Version 1.0. Research software on reproducing PlayStation-era aesthetics on 3D-scanned objects. Feedback and issues welcome.

## License

[MIT](LICENSE)

## Links

- **Project Page:** [rendyrayana.my.id/lofi-viewer](https://rendyrayana.my.id/lofi-viewer/)
- **Live Preview:** [rendyrayana.github.io/lofi-viewer](https://rendyrayana.github.io/lofi-viewer)
- **GitHub:** [github.com/rendyrayana/lofi-viewer](https://github.com/rendyrayana/lofi-viewer)
- **More projects:** [rendyrayana.my.id](https://rendyrayana.my.id)
