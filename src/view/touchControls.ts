/** How far a thumb drags sideways from where it first touched to reach full rudder, in CSS px. */
const FULL_RUDDER_DRAG_PX = 80;

/**
 * The phone controls: a throttle lever on the right edge with the Fireball button at its foot, and a
 * steering area on the left half.
 * They are page elements that index.html shows only on touch devices. Pointer events give one
 * pointer per finger, so both thumbs work at once.
 */
export class TouchControls {
  /** -1 (full left) to 1 (full right) while a thumb drags on the steering area, else 0. */
  rudder = 0;
  /** The throttle the lever asks for, until the game takes it. */
  private leverThrottle?: number;
  private steeringPointer?: number;
  private steeringStartX = 0;
  private leverFill = document.getElementById('lever-fill')!;
  private leverValue = document.getElementById('lever-value')!;
  private shownPercent?: number;
  /** True once the Fireball button is pressed, until the game takes the press. */
  private fireballPressed = false;
  private fireballButton = document.getElementById('fireball-button')!;

  constructor() {
    const lever = document.getElementById('throttle-lever')!;
    const track = document.getElementById('lever-track')!;
    const setLever = (event: PointerEvent) => {
      const { top, bottom } = track.getBoundingClientRect();
      this.leverThrottle = (bottom - event.clientY) / (bottom - top);
    };
    lever.addEventListener('pointerdown', setLever);
    lever.addEventListener('pointermove', (event) => {
      if (event.buttons) setLever(event);
    });

    // A sibling of the lever, not inside it, so the thumb on the button never moves the lever.
    this.fireballButton.addEventListener('pointerdown', () => {
      this.fireballPressed = true;
    });

    const steering = document.getElementById('steering-area')!;
    steering.addEventListener('pointerdown', (event) => {
      if (this.steeringPointer !== undefined) return;
      this.steeringPointer = event.pointerId;
      this.steeringStartX = event.clientX;
    });
    steering.addEventListener('pointermove', (event) => {
      if (event.pointerId !== this.steeringPointer) return;
      this.rudder = Math.max(-1, Math.min(1, (event.clientX - this.steeringStartX) / FULL_RUDDER_DRAG_PX));
    });
    const lift = (event: PointerEvent) => {
      if (event.pointerId !== this.steeringPointer) return;
      this.steeringPointer = undefined;
      this.rudder = 0;
    };
    steering.addEventListener('pointerup', lift);
    steering.addEventListener('pointercancel', lift);
  }

  /** The throttle the lever asked for since the last call, if it moved. */
  takeThrottle(): number | undefined {
    const throttle = this.leverThrottle;
    this.leverThrottle = undefined;
    return throttle;
  }

  /** Whether the Fireball button was pressed since the last call. */
  takeFireball(): boolean {
    const pressed = this.fireballPressed;
    this.fireballPressed = false;
    return pressed;
  }

  /** Shows the seconds left of the cooldown, or that no enemy is in range, or that a throw is ready. */
  showFireball(cooldownSeconds: number, hasTarget: boolean): void {
    const text = cooldownSeconds > 0 ? String(cooldownSeconds) : hasTarget ? 'Fire' : 'No target';
    if (this.fireballButton.textContent !== text) this.fireballButton.textContent = text;
    this.fireballButton.classList.toggle('waiting', cooldownSeconds > 0 || !hasTarget);
  }

  /** Moves the lever to the world's throttle, so it shows the value whatever set it. */
  showThrottle(throttle: number): void {
    const percent = Math.round(throttle * 100);
    if (percent === this.shownPercent) return;
    this.shownPercent = percent;
    this.leverFill.style.height = `${percent}%`;
    this.leverValue.textContent = `${percent}%`;
  }
}
