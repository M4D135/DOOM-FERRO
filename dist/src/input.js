/** Standard gamepad sampling, without browser or game dependencies. */
const idle = () => ({ forward: 0, strafe: 0, turn: 0, look: 0, fire: false, use: false, run: false });
const axis = value => Math.abs(value || 0) < 0.18 ? 0 : Math.sign(value) * Math.min(1, (Math.abs(value) - 0.18) / 0.82);

export class GamepadControls {
  constructor() {
    this.previous = [];
    this.blocked = new Set();
    this.menuAxis = 0;
    this.padIndex = null;
  }

  clear() {
    // A held trigger/button must be released before it can act after a menu.
    this.previous.forEach((pressed, index) => { if (pressed) this.blocked.add(index); });
  }

  sample(pads, dt, mode) {
    const pad = Array.from(pads || []).find(value => value && value.connected);
    const result = { action: null, difficulty: 0, map: false, cycleWeapon: false, active: false, input: idle() };
    if (!pad) {
      this.previous = []; this.blocked.clear(); this.menuAxis = 0; this.padIndex = null;
      return result;
    }
    if (this.padIndex !== pad.index) {
      this.previous = []; this.blocked.clear(); this.menuAxis = 0; this.padIndex = pad.index;
    }
    const buttons = pad.buttons.map(button => Boolean(button?.pressed));
    for (const index of this.blocked) if (!buttons[index]) this.blocked.delete(index);
    const down = index => Boolean(buttons[index]) && !this.blocked.has(index);
    const edge = index => down(index) && !this.previous[index];
    const vertical = Math.abs(pad.axes[1] || 0) > 0.55 ? Math.sign(pad.axes[1]) : 0;
    const horizontal = Math.abs(pad.axes[0] || 0) > 0.55 ? Math.sign(pad.axes[0]) : 0;
    const direction = vertical || horizontal;
    result.active = buttons.some(Boolean) || pad.axes.some(value => Math.abs(value) > 0.18);

    if (mode === 'title') {
      if (edge(0) || edge(9)) result.action = 'start';
      else result.difficulty = edge(12) || edge(14) ? -1 : edge(13) || edge(15) ? 1 : direction && direction !== this.menuAxis ? direction : 0;
    } else if (mode === 'paused') {
      if (edge(0) || edge(9)) result.action = 'resume';
    } else if (mode === 'dead' || mode === 'complete') {
      if (edge(0) || edge(9)) result.action = 'start';
    } else if (mode === 'playing') {
      if (edge(9)) result.action = 'pause';
      else {
        result.map = edge(8);
        result.cycleWeapon = edge(3) || edge(5);
        result.input = { forward: -axis(pad.axes[1]), strafe: axis(pad.axes[0]),
          turn: -axis(pad.axes[2]) * dt * 2.7, look: -axis(pad.axes[3]) * dt * 1.7,
          fire: down(7), use: edge(0) || edge(2), run: down(10) || down(4) };
      }
    }
    this.previous = buttons;
    this.menuAxis = direction;
    if (result.action) this.clear();
    return result;
  }
}
