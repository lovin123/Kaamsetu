export const ROLES = {
  WORKER: 'WORKER',
  SUPERVISOR: 'SUPERVISOR',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const LANGUAGES = {
  'hi-IN': 'Hindi',
  'mr-IN': 'Marathi',
  'en-IN': 'English',
  hinglish: 'Hinglish',
} as const;

export type PreferredLanguage = keyof typeof LANGUAGES;
