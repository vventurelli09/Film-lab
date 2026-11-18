export type Sport = { id: string; label: string; focuses: string[]; batSport?: boolean };

const diamond = ['Hitting / swing', 'Pitching', 'Fielding', 'Throwing', 'Catching', 'Baserunning'];

export const SPORTS: Sport[] = [
  { id: 'softball', label: 'Softball', focuses: diamond, batSport: true },
  { id: 'baseball', label: 'Baseball', focuses: diamond, batSport: true },
  { id: 'basketball', label: 'Basketball', focuses: ['Shooting form', 'Ball handling', 'Footwork', 'Defense', 'Team offense', 'Team defense'] },
  { id: 'soccer', label: 'Soccer', focuses: ['Striking', 'First touch', 'Dribbling', 'Defending', 'Goalkeeping', 'Team shape'] },
  { id: 'volleyball', label: 'Volleyball', focuses: ['Serving', 'Passing', 'Setting', 'Attacking', 'Blocking', 'Team rotation'] },
  { id: 'football', label: 'Football', focuses: ['Throwing', 'Route running', 'Tackling', 'Blocking', 'Footwork', 'Team play'] },
  { id: 'other', label: 'Other', focuses: ['General technique', 'Footwork', 'Team play'] },
];

export const sportLabel = (id: string) => SPORTS.find((s) => s.id === id)?.label ?? id;

/** Longest clip the AI will analyze in one go. */
export const MAX_CLIP_SECONDS = 15;

/**
 * Spreads the frame budget across the selected clip: as dense as possible
 * (0.1s at best) while staying within MAX_FRAMES.
 */
export function autoInterval(clipSeconds: number) {
  const raw = clipSeconds / (MAX_FRAMES - 1);
  return Math.max(0.1, Math.ceil(raw * 20) / 20);
}
export const frameCount = (clipSeconds: number, interval: number) =>
  Math.min(MAX_FRAMES, Math.floor(clipSeconds / interval + 1e-6) + 1);

export const SESSION_TYPES = [
  { id: 'individual', label: 'Individual' },
  { id: 'practice', label: 'Practice' },
  { id: 'game', label: 'Game' },
  { id: 'team', label: 'Team assessment (coach)' },
];

export const MAX_FRAMES = 40;
