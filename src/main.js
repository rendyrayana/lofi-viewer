import { initScene, tick } from './scene.js';
import { initUI } from './ui.js';
import { initDragDrop } from './loader.js';

const viewport = document.getElementById('viewport');

// Boot after first layout paint so clientWidth/Height are non-zero
requestAnimationFrame(() => {
  initScene(viewport);
  initUI(viewport);
  initDragDrop(viewport);

  function loop() {
    requestAnimationFrame(loop);
    tick();
  }
  loop();
});
