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

/** Fast motions get 0.1s sampling; everything else 0.5s. */
export function defaultInterval(focus: string) {
  return /swing|hitting|pitch|throw|serv|attack|shoot|strik/i.test(focus) ? 0.1 : 0.5;
}

export const SESSION_TYPES = [
  { id: 'individual', label: 'Individual' },
  { id: 'practice', label: 'Practice' },
  { id: 'game', label: 'Game' },
  { id: 'team', label: 'Team assessment (coach)' },
];

export const MAX_FRAMES = 40;
