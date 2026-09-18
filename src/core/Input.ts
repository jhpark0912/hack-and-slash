export class Input {
  private down = new Set<string>();
  private pressed = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  mouseJustDown = false;
  rightDown = false;
  enabled = true;

  constructor(private el: HTMLElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = this.norm(e.code);
      this.down.add(k);
      this.pressed.add(k);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(this.norm(e.code)));
    window.addEventListener('blur', () => { this.down.clear(); this.mouseDown = false; });
    el.addEventListener('mousemove', (e) => { this.mouseX = e.clientX; this.mouseY = e.clientY; });
    el.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.mouseDown = true; this.mouseJustDown = true; }
      if (e.button === 2) this.rightDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private norm(code: string) {
    return code;
  }

  isDown(code: string) { return this.enabled && this.down.has(code); }
  justPressed(code: string) { return this.pressed.has(code); }

  /** movement axis from WASD / arrows, normalized */
  axis(): { x: number; z: number } {
    if (!this.enabled) return { x: 0, z: 0 };
    let x = 0, z = 0;
    if (this.down.has('KeyW') || this.down.has('ArrowUp')) z -= 1;
    if (this.down.has('KeyS') || this.down.has('ArrowDown')) z += 1;
    if (this.down.has('KeyA') || this.down.has('ArrowLeft')) x -= 1;
    if (this.down.has('KeyD') || this.down.has('ArrowRight')) x += 1;
    const l = Math.hypot(x, z);
    if (l > 0) { x /= l; z /= l; }
    return { x, z };
  }

  /** call at end of frame */
  endFrame() {
    this.pressed.clear();
    this.mouseJustDown = false;
  }
}
