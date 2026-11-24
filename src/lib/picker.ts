// Point-and-click element picker. Hover highlights, click picks, ArrowUp
// widens to the parent, Escape cancels.

const Z = '2147483647';

function banner(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  Object.assign(el.style, {
    position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: Z,
    background: '#111', color: '#fff', font: '14px/1.4 system-ui, sans-serif', padding: '8px 14px',
    borderRadius: '6px', boxShadow: '0 2px 12px rgba(0,0,0,.4)', pointerEvents: 'none', maxWidth: '90vw',
  });
  return el;
}

export function pickElement(prompt: string, signal: AbortSignal, showBanner = true): Promise<Element> {
  return new Promise((resolve, reject) => {
    const box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed', zIndex: Z, pointerEvents: 'none', outline: '3px solid #ff3d7f',
      background: 'rgba(255,61,127,.12)', transition: 'all 60ms',
    });
    const note = banner(`botleneck: ${prompt}  (↑ widen, Esc cancel)`);
    document.documentElement.append(box);
    if (showBanner) document.documentElement.append(note);
    let current: Element | null = null;

    const show = (el: Element | null) => {
      current = el;
      const r = el?.getBoundingClientRect();
      Object.assign(box.style, r
        ? { display: 'block', top: `${r.top}px`, left: `${r.left}px`, width: `${r.width}px`, height: `${r.height}px` }
        : { display: 'none' });
    };
    const block = (e: Event) => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const onMove = (e: MouseEvent) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== box && el !== note) show(el);
    };
    const onClick = (e: MouseEvent) => {
      block(e);
      done();
      if (current) resolve(current);
      else reject(new Error('nothing picked'));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        block(e);
        done();
        reject(new Error('cancelled'));
      } else if (e.key === 'ArrowUp' && current?.parentElement && current.parentElement !== document.documentElement) {
        block(e);
        show(current.parentElement);
      }
    };
    const onAbort = () => {
      done();
      reject(new Error('cancelled'));
    };
    const events: [string, EventListener][] = [
      ['mousemove', onMove as EventListener],
      ['click', onClick as EventListener],
      ['mousedown', block],
      ['mouseup', block],
      ['keydown', onKey as EventListener],
    ];
    function done() {
      for (const [t, f] of events) window.removeEventListener(t, f, true);
      signal.removeEventListener('abort', onAbort);
      box.remove();
      note.remove();
    }
    for (const [t, f] of events) window.addEventListener(t, f, true);
    signal.addEventListener('abort', onAbort);
    if (signal.aborted) onAbort();
  });
}

export function flash(el: Element): void {
  const h = el as HTMLElement;
  const prev = h.style.outline;
  h.style.outline = '3px solid #24c46b';
  setTimeout(() => (h.style.outline = prev), 1500);
}
