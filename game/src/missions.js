// Neon Bay — the story: five missions for the fixer Vera Solano, each a
// chain of objective steps, with payouts and a free-roam epilogue.

export const MISSIONS = [
  {
    id: 0,
    name: 'First Job',
    brief:
      'Vera Solano runs the Sunset Bar and half the jobs in Neon Bay. She wants to meet the new driver. Get to the bar and introduce yourself.',
    pay: 500,
    steps: [
      { type: 'goto', at: 'veraBar', label: 'Drive to The Sunset Bar' },
      { type: 'goto', at: 'pier', label: 'Meet Vera’s contact at Neon Pier' },
    ],
  },
  {
    id: 1,
    name: 'Hot Wheels',
    brief:
      'A client wants a Comet GT, no questions asked. Vera spotted one parked uptown. Steal it and bring it to Rico’s Garage — and try not to attract the PD.',
    pay: 900,
    steps: [
      { type: 'steal', label: 'Steal the Comet GT uptown' },
      { type: 'deliver', at: 'garage', label: 'Deliver the Comet GT to Rico’s Garage' },
    ],
  },
  {
    id: 2,
    name: 'Heat Wave',
    brief:
      'The Breakers set you up — the cops think you hit their warehouse. You’re hot now. Shake a 3-star wanted level and get back to the Hideout in one piece.',
    pay: 1200,
    steps: [
      { type: 'heat', level: 3, label: 'The cops are onto you — wanted level 3' },
      { type: 'lose', label: 'Lose the cops' },
      { type: 'goto', at: 'hideout', label: 'Get back to the Hideout' },
    ],
  },
  {
    id: 3,
    name: 'The Drop',
    brief:
      'A package is waiting at the pier. Pick it up and run it across town to the Sunset Bar. Vera’s buyer leaves in 90 seconds — don’t be late.',
    pay: 1600,
    steps: [
      { type: 'goto', at: 'pier', label: 'Pick up the package at Neon Pier' },
      { type: 'timed', at: 'veraBar', seconds: 90, label: 'Deliver the package to The Sunset Bar' },
    ],
  },
  {
    id: 4,
    name: 'Bay Run',
    brief:
      'The final run. The Breakers are watching every bridge, so take the long way: three checkpoints across Neon Bay, then vanish at the Hideout. Vera’s biggest payout yet.',
    pay: 2500,
    steps: [
      { type: 'checkpoint', at: 'policeStation', label: 'Checkpoint 1: past Neon Bay PD' },
      { type: 'checkpoint', at: 'pier', label: 'Checkpoint 2: Neon Pier' },
      { type: 'checkpoint', at: 'garage', label: 'Checkpoint 3: Rico’s Garage' },
      { type: 'goto', at: 'hideout', label: 'Vanish at the Hideout' },
    ],
  },
];

export class MissionManager {
  constructor(state) {
    this.state = state;
    this.done = 0; // missions completed
    this.active = null; // { mission, stepIndex, timer, stealCar }
    this.failed = false;
  }

  get current() {
    return MISSIONS[this.done] || null;
  }

  get startPoint() {
    // Every mission starts at Vera's bar.
    return this.state.city.landmarks.veraBar;
  }

  // The active objective's world position (for the beacon + minimap).
  objectivePos() {
    if (!this.active) return this.startPoint;
    const step = this.active.mission.steps[this.active.stepIndex];
    if (!step) return null;
    if (step.type === 'steal' && this.active.stealCar) {
      return { x: this.active.stealCar.x, y: this.active.stealCar.y };
    }
    if (step.at) return this.state.city.landmarks[step.at];
    return null;
  }

  objectiveLabel() {
    if (!this.active) {
      const m = this.current;
      if (!m) return 'Story complete — Neon Bay is yours. Free roam!';
      return `Next job: ${m.name} — go to The Sunset Bar`;
    }
    const step = this.active.mission.steps[this.active.stepIndex];
    let label = step ? step.label : '';
    if (step && step.type === 'timed' && this.active.timer != null) {
      label += ` — ${Math.ceil(this.active.timer)}s left`;
    }
    return label;
  }

  start() {
    const m = this.current;
    if (!m || this.active) return;
    this.active = { mission: m, stepIndex: 0, timer: null, stealCar: null };
    this.failed = false;
    this.state.showBrief(m);
    this.setupStep();
  }

  setupStep() {
    const step = this.active.mission.steps[this.active.stepIndex];
    if (!step) return;
    if (step.type === 'timed') this.active.timer = step.seconds;
    if (step.type === 'heat') {
      this.state.wanted = Math.max(this.state.wanted, step.level);
      this.state.toast(`WANTED LEVEL ${step.level} — THE BREAKERS SET YOU UP`, '#ff5a5a');
    }
    if (step.type === 'steal') {
      // Spawn the target sports car uptown.
      const { city } = this.state;
      const x = city.roads[6];
      const y = city.roads[1];
      const car = this.state.spawnParkedCar(x + 60, y + 30, 'sports', '#e8e8e8');
      this.active.stealCar = car;
    }
  }

  advance() {
    this.state.audio.pickup();
    this.active.stepIndex++;
    if (this.active.stepIndex >= this.active.mission.steps.length) {
      this.complete();
    } else {
      this.setupStep();
      const step = this.active.mission.steps[this.active.stepIndex];
      this.state.toast(step.label, '#ffcf5a');
    }
  }

  complete() {
    const m = this.active.mission;
    this.state.player.money += m.pay;
    this.state.stats.earned += m.pay;
    this.done++;
    this.active = null;
    this.state.audio.missionComplete();
    this.state.toast(`MISSION COMPLETE: ${m.name} — +$${m.pay.toLocaleString('en-US')}`, '#7fd94f');
    this.state.save();
    if (this.done >= MISSIONS.length) {
      this.state.toast('STORY COMPLETE — YOU OWN NEON BAY', '#ffd76a');
    }
  }

  fail(reason) {
    this.active = null;
    this.failed = true;
    this.state.audio.missionFailed();
    this.state.toast(`MISSION FAILED — ${reason}. Return to the bar to retry.`, '#ff5a5a');
  }

  update(dt) {
    const s = this.state;
    if (!this.active) {
      // Standing at the bar starts the next mission.
      const m = this.current;
      if (m && !s.player.inCar) {
        const p = this.startPoint;
        const d = Math.hypot(s.player.x - p.x, s.player.y - p.y);
        if (d < 60) this.start();
      }
      return;
    }
    const step = this.active.mission.steps[this.active.stepIndex];
    if (!step) return;
    if (step.type === 'timed') {
      this.active.timer -= dt;
      if (this.active.timer <= 0) {
        this.fail('OUT OF TIME');
        return;
      }
    }
    if (step.type === 'goto' || step.type === 'deliver' || step.type === 'checkpoint') {
      const p = s.city.landmarks[step.at];
      const px = s.player.inCar && s.player.car ? s.player.car.x : s.player.x;
      const py = s.player.inCar && s.player.car ? s.player.car.y : s.player.y;
      const d = Math.hypot(px - p.x, py - p.y);
      const radius = step.type === 'checkpoint' ? 90 : 70;
      if (d < radius) {
        if (step.type === 'deliver') {
          // Must arrive in the stolen car.
          const car = this.active.stealCar;
          if (!s.player.inCar || s.player.car !== car) {
            if (!this._warned) {
              this._warned = true;
              s.toast('Bring the Comet GT here!', '#ffcf5a');
            }
            return;
          }
          this._warned = false;
        }
        this.advance();
      }
    } else if (step.type === 'steal') {
      const car = this.active.stealCar;
      if (car && s.player.inCar && s.player.car === car) this.advance();
    } else if (step.type === 'heat') {
      if (s.wanted >= step.level) this.advance();
    } else if (step.type === 'lose') {
      if (s.wanted === 0) this.advance();
    }
  }
}
