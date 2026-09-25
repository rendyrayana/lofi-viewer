# lofi-viewer

A browser-based 3D model viewer that renders through a PS1/PSX-style pipeline — low internal resolution, vertex snapping, affine texture warping, dithered color reduction, and optional CRT post-effects.

![lofi-viewer screenshot](https://github.com/user-attachments/assets/placeholder)

## Features

- **PSX render pipeline** — low-res render target, vertex snapping, affine texture warp, 15-bit color dither
- **Import** — drag & drop or file-pick `.glb`, `.obj`, `.fbx` models; optional separate texture map
- **Render controls** — render scale, vertex snap precision, color depth, dither pattern, wireframe, backface culling
- **Environment** — ambient + key light with color picker, HDRI/skybox, fog, background color
- **Camera** — perspective / orthographic, field of view, aspect ratio presets, auto-frame
- **Effects** — CRT curvature, scanlines, vignette, chromatic aberration, film grain, color grade, bloom
- **Export** — snapshot PNG, turntable WebM video (fixed duration or one full loop), save as standalone HTML viewer, copy preset link
- **Viewer mode** — fullscreen presentation mode with no UI chrome
- **Floating toolbar** — orbit / pan / frame toggle, turntable play, projection switch
- **Monochrome UI** — dark/light invert toggle; no hue in the app chrome

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Build

```bash
npm run build
```

Output goes to `dist/`. The built app is fully static — just serve the `dist/` folder.

## Usage

1. Click **Load Model** to import a `.glb`, `.obj`, or `.fbx` file.
2. Optionally load a **Texture Map** to override the model's diffuse.
3. Adjust settings across the six panels: **Import / Render / Environment / Camera / Effects / Export**.
4. Use the floating toolbar at the bottom of the viewport to switch between orbit and pan, frame the model, or toggle turntable rotation.
5. Export a snapshot, video, or standalone HTML file from the **Export** panel.

## Stack

- [Three.js](https://threejs.org/) — scene, loaders, OrbitControls
- [Vite](https://vitejs.dev/) — dev server and build

## License

MIT
