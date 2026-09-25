import { store } from '../store.js';

// Track the actual azimuth angle from OrbitControls to stop at exactly 360°,
// so the loop duration follows the real turntable speed with no guesswork.
export function recordTurntableLoop(renderer, controls = null, videoRes = 'native', pipeline = null, onProgress = null, onDone = null) {
  if (!renderer) return;

  const canvas = renderer.domElement;
  const origW  = canvas.clientWidth;
  const origH  = canvas.clientHeight;
  const scale  = videoRes === '4x' ? 4 : videoRes === '2x' ? 2 : 1;

  if (scale > 1 && pipeline) {
    renderer.setSize(origW * scale, origH * scale, false);
    pipeline.resize(origW * scale, origH * scale);
  }

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';
  const recorder = new MediaRecorder(canvas.captureStream(60), {
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
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = `lofi-viewer-${Date.now()}.webm`; a.click();
    URL.revokeObjectURL(url);
    onDone?.();
  };
  recorder.start();

  // Track actual azimuth angle; stop at exactly 2π regardless of speed.
  if (controls && typeof controls.getAzimuthalAngle === 'function') {
    let prev        = controls.getAzimuthalAngle();
    let accumulated = 0;
    const TWO_PI    = 2 * Math.PI;

    function tick() {
      const curr  = controls.getAzimuthalAngle();
      let   delta = curr - prev;
      if (delta >  Math.PI) delta -= TWO_PI;
      if (delta < -Math.PI) delta += TWO_PI;
      accumulated += Math.abs(delta);
      prev = curr;

      onProgress?.(Math.min(accumulated / TWO_PI * 100, 99));

      if (accumulated >= TWO_PI - 0.02) {
        onProgress?.(100);
        recorder.stop();
      } else {
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  } else {
    // Fallback: time-based estimate.
    const rotationSpeed = store.get('rotationSpeed') || 1.0;
    const ms = (30 / Math.max(0.1, rotationSpeed)) * 1000;
    const start = Date.now();
    const iv = setInterval(() => onProgress?.(Math.min((Date.now() - start) / ms * 100, 99)), 100);
    setTimeout(() => { clearInterval(iv); onProgress?.(100); recorder.stop(); }, ms);
  }
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
