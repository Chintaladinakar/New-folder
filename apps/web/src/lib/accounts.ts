// The server's rules for usernames and PINs, so forms can point out a problem before sending.
// Keep in step with pinProblem() in apps/api/src/services/authService.ts and the username schema.

const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function usernameProblem(value: string): string | null {
  const name = value.trim().toLowerCase();
  if (!name) return 'Choose a username';
  if (name.length < 3) return 'Usernames are at least 3 characters';
  if (name.length > 32) return 'Usernames are 32 characters at most';
  if (!/^[a-z0-9]/.test(name)) return 'Start with a letter or a digit';
  if (!USERNAME.test(name)) return 'Use letters, digits, dots, dashes and underscores only';
  return null;
}

/** "Priya Raman" → "priya.raman". Empty when the name has nothing a username can use. */
export function suggestUsername(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, 32);
}

export function pinProblem(pin: string): string | null {
  if (!/^\d{6}$/.test(pin)) return 'The PIN must be exactly 6 digits';
  const digits = [...pin].map(Number);
  const steps = new Set(digits.slice(1).map((digit, index) => digit - digits[index]));
  if (steps.size === 1 && [0, 1, -1].includes([...steps][0])) return 'Too easy to guess: avoid one digit repeated, or runs like 123456';
  return null;
}

/** What a PIN field keeps of what was typed or pasted. */
export const pinDigits = (value: string) => value.replace(/\D/g, '').slice(0, 6);

/** "482913" → "482 913", easier to read out. */
export const formatPin = (pin: string) => `${pin.slice(0, 3)} ${pin.slice(3)}`;
