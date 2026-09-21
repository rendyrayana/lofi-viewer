import { renderer, state, currentModel } from './scene.js';

export function exportPNG() {
  const dataURL = renderer.domElement.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = 'lofi-viewer-screenshot.png';
  a.click();
}

export function exportWebM() {
  const canvas = renderer.domElement;

  // Estimate one rotation duration based on turntable speed
  const rotationDuration = (2 * Math.PI) / Math.max(0.01, state.turntableSpeed);

  let stream;
  try {
    stream = canvas.captureStream(30);
  } catch (e) {
    console.error('captureStream not supported:', e);
    alert('WebM export not supported in this browser.');
    return;
  }

  const chunks = [];
  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }
  }

  const recorder = new MediaRecorder(stream, { mimeType });
  recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lofi-viewer-rotation.webm';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  // Force turntable on
  const wasTurntable = state.turntable;
  state.turntable = true;

  // Reset model rotation
  if (currentModel) currentModel.rotation.y = 0;

  recorder.start();

  setTimeout(() => {
    recorder.stop();
    state.turntable = wasTurntable;
  }, rotationDuration * 1000);
}
