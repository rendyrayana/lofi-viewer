import { Muxer, ArrayBufferTarget } from 'mp4-muxer';

// H.264 profiles to try, highest first; level 5.1 covers 4K.
const CODECS = ['avc1.640033', 'avc1.4D0033', 'avc1.42E033', 'avc1.42E01F'];

export const canRecordMp4 = () => typeof window.VideoEncoder === 'function' && typeof window.VideoFrame === 'function';

// Renders `frames` frames through drawFrame(i, ctx, width, height), which must
// paint the composite canvas, and encodes them into an MP4. Frames are rendered
// one by one at exact times, so nothing is dropped and the loop closes exactly.
export async function encodeMp4({ width, height, frames, fps = 30, bitrate, drawFrame, onProgress }) {
  width = Math.max(2, width & ~1);
  height = Math.max(2, height & ~1);
  const config = { width, height, framerate: fps, bitrate: bitrate ?? Math.round(width * height * fps * 0.15) };
  let codec = null;
  for (const c of CODECS) {
    const { supported } = await VideoEncoder.isConfigSupported({ ...config, codec: c });
    if (supported) { codec = c; break; }
  }
  if (!codec) throw new Error('This browser cannot encode H.264 video at this size.');

  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width, height, frameRate: fps }, fastStart: 'in-memory' });
  let failure = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: e => { failure = e; },
  });
  encoder.configure({ ...config, codec });

  const composite = document.createElement('canvas');
  composite.width = width; composite.height = height;
  const ctx = composite.getContext('2d');

  for (let i = 0; i < frames; i++) {
    if (failure) throw failure;
    drawFrame(i, ctx, width, height);
    const frame = new VideoFrame(composite, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    while (encoder.encodeQueueSize > 4) await new Promise(r => setTimeout(r, 0));
    onProgress?.((i + 1) / frames);
  }
  await encoder.flush();
  encoder.close();
  if (failure) throw failure;
  muxer.finalize();
  return new Uint8Array(muxer.target.buffer);
}
