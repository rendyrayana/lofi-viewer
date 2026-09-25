# lofi-viewer

> Browser-based PSX/PS1-style 3D model viewer. Load any model, dial in the retro look, export.

**[Live Preview](#)** · **[Project Page](#)** · [Rendy Rayana](https://rendyrayana.my.id)

## Overview

lofi-viewer is a browser-based tool that loads arbitrary 3D models and renders them through a PS1-style pipeline — low internal resolution, vertex snapping, affine texture warping, dithered 15-bit color, and optional CRT post-effects. It covers the full workflow from import to export: tweak the look in the editor, then save a standalone HTML viewer or record a turntable video.

## Screenshots

| | |
|---|---|
| ![](docs/screenshot-1.png) | ![](docs/screenshot-2.png) |
| *PSX render pipeline* | *CRT effects + bloom* |

## Features

- PSX render pipeline: low-res render target, vertex snapping, affine texture warp, 15-bit color dither
- Import `.glb`, `.obj`, `.fbx` models with optional separate texture map
- Render controls: render scale, snap precision, color depth, dither pattern, wireframe, backface culling
- Environment: ambient + key light with color picker, HDRI/skybox, fog, background color
- Camera: perspective / orthographic, FOV, aspect ratio presets, auto-frame
- Effects: CRT curvature, scanlines, vignette, chromatic aberration, film grain, color grade, bloom
- Export: snapshot PNG, turntable WebM video, standalone self-contained HTML viewer, shareable preset link
- Viewer mode: fullscreen presentation with no UI chrome
- Floating toolbar: orbit / pan / frame, turntable play, projection toggle
- Monochrome UI with dark / light invert toggle

## Requirements

- Node.js 18+
- Modern browser with WebGL2 support (Chrome, Firefox, Safari)

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
| [Vite](https://vitejs.dev) | Dev server and build tooling |

## Status

`Prototype`. Built as part of ongoing exploration into browser-based creative tools. Feedback and issues welcome.

## License

[MIT](LICENSE)

## Links

- **Live Preview:** [link](#)
- **More projects:** [rendyrayana.my.id](https://rendyrayana.my.id)
