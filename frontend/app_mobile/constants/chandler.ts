export const APP_TITLE = "Chandler's AI";
export const APP_TAGLINE = 'Can this app BE any more of what I want it to be?';

export const LOADING_LINES = [
  'Could this BE any more loading?',
  'Hold on, I do transponding…',
  'Okay, so this is a thing I can do.',
  'Somewhere between sarcasm and a compiler.',
  'I say more dumb things before 9am than most people say all day.',
];

export const BUILDING_LINES = [
  'Building your app. Could this BE any more exciting?',
  'Writing HTML like it owes me money.',
  'Assembling furniture. Metaphorically.',
  'This is me, being productive.',
];

export const EMPTY_CHAT_LINES = [
  'We were on a break. Ask me for an app.',
  'Hi, I make apps. It is my thing.',
  "Tell me what to build. I'll be over here being funny.",
];

export const ERROR_PREFIX = 'PIVOT!';

/** Deterministic-ish pick so the line does not thrash on every re-render. */
export function pickLine(lines: string[], seed: number) {
  return lines[Math.abs(seed) % lines.length];
}
