// Neon Bay — saving to localStorage: money, mission progress, position.

const KEY = 'neonbay-save-v1';

export function saveGame(state) {
  try {
    const data = {
      version: 1,
      money: Math.floor(state.player.money),
      missionsDone: state.missions.done,
      x: Math.round(state.player.x),
      y: Math.round(state.player.y),
      health: Math.round(state.player.health),
      earned: Math.floor(state.stats.earned),
      muted: state.audio.muted,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (private mode): the game still plays.
  }
}

export function loadGame() {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function hasSave() {
  return loadGame() !== null;
}
