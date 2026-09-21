import { initScene, tick } from './scene.js';
import { initUI } from './ui.js';
import { initDragDrop } from './loader.js';

const viewport = document.getElementById('viewport');

// Boot
initScene(viewport);
initUI(viewport);
initDragDrop(viewport);

// Render loop
function loop() {
  requestAnimationFrame(loop);
  tick();
}
loop();
