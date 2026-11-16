(() => {
  const allowed = new Set(['360x640', '390x844', '1280x720']);
  const params = new URLSearchParams(location.search);
  const size = params.get('size') || '390x844';
  const app = params.get('app');
  if (!allowed.has(size)) throw new Error(`Unsupported Q3 viewport: ${size}`);
  if (!app) throw new Error('Missing same-origin app URL in ?app=');
  const [width, height] = size.split('x').map(Number);
  const frame = document.querySelector('#game-frame');
  frame.style.setProperty('--frame-width', `${width}px`);
  frame.style.setProperty('--frame-height', `${height}px`);
  frame.dataset.requestedViewport = size;
  // Keep the frame on the same origin; this makes parent measurement and child QA inspection explicit.
  const target = new URL(app, location.href);
  if (target.origin !== location.origin) throw new Error('Game iframe must be same-origin with the wrapper');
  frame.src = target.href;
  window.__Q3_NARROW__ = {
    frame,
    requested: { width, height, size },
    measure() {
      const r = frame.getBoundingClientRect();
      return { requested: this.requested, rect: { x:r.x, y:r.y, width:r.width, height:r.height }, dpr: devicePixelRatio };
    }
  };
})();
