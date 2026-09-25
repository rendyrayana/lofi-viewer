import { store } from '../store.js';

// OrbitControls with delta: autoRotateSpeed=2 → 30s/rotation at rotationSpeed=1.
// Formula: one orbit = 30 / rotationSpeed seconds (frame-rate independent with delta).
export function recordTurntableLoop(renderer, videoRes = 'native', pipeline = null) {
  const rotationSpeed = store.get('rotationSpeed') || 1.0;
  // Keep two decimal precision — avoids Math.round drift at fractional speeds.
  const duration = 30 / Math.max(0.1, rotationSpeed);
  recordTurntable(renderer, duration, videoRes, pipeline);
}

export function recordTurntable(renderer, durationSec = 4, videoRes = 'native', pipeline = null) {
  if (!renderer) return;

  const canvas = renderer.domElement;
  const origW = canvas.clientWidth;
  const origH = canvas.clientHeight;
  const scale = videoRes === '4x' ? 4 : videoRes === '2x' ? 2 : 1;

  if (scale > 1 && pipeline) {
    renderer.setSize(origW * scale, origH * scale, false);
    pipeline.resize(origW * scale, origH * scale);
  }

  // 60fps capture; high bitrate (16 Mbps) keeps pixel-art edges sharp through VP9.
  const stream = canvas.captureStream(60);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9'
    : 'video/webm';
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 16_000_000 * scale * scale,
  });
  const chunks = [];

  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    if (scale > 1 && pipeline) {
      renderer.setSize(origW, origH, false);
      pipeline.resize(origW, origH);
    }
    const blob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lofi-viewer-${Date.now()}.webm`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const wasOn = store.get('turntable');
  store.set('turntable', true);
  recorder.start();

  setTimeout(() => {
    recorder.stop();
    if (!wasOn) store.set('turntable', false);
  }, durationSec * 1000);
}
