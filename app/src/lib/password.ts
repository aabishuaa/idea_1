/**
 * Password rules, in one place so sign-up and "change password" cannot drift
 * apart and tell a user two different things.
 *
 * Deliberately shown as live checks rather than enforced silently: this app is
 * for people who may not use many apps, and "your password is invalid" with no
 * reason is where those users give up.
 */

export interface PasswordCheck {
  label: string;
  met: boolean;
}

export function passwordChecks(password: string): PasswordCheck[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'A capital and a small letter', met: /[a-z]/.test(password) && /[A-Z]/.test(password) },
    { label: 'At least one number', met: /\d/.test(password) },
    { label: 'A symbol like ! or #', met: /[^A-Za-z0-9]/.test(password) },
  ];
}

/** Passwords that are long but trivially guessable still fail. */
const COMMON = [
  'password', '12345678', 'qwerty', 'letmein', 'welcome', 'iloveyou',
  'admin123', 'jamaica', 'kingston', 'abc12345',
];

export interface PasswordStrength {
  /** 0–4. 3 is the minimum we accept. */
  score: number;
  label: string;
}

export function passwordStrength(password: string): PasswordStrength {
  if (password.length === 0) return { score: 0, label: '' };

  const lower = password.toLowerCase();
  if (COMMON.some((common) => lower.includes(common))) {
    return { score: 1, label: 'Too easy to guess — avoid common words' };
  }

  let score = passwordChecks(password).filter((check) => check.met).length;
  // Length beats character classes for real-world strength.
  if (password.length >= 14) score = Math.min(4, score + 1);
  if (password.length < 8) score = Math.min(score, 1);

  const labels = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  return { score, label: labels[score] ?? '' };
}

/** Cheap sanity check — real validation is the confirmation email. */
export function isEmailShaped(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}
