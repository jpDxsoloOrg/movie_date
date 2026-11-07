/** Same rules and wording as the old login and register forms. Null means valid. */
const MIN_PASSWORD_LENGTH = 6;

export function validateRequired(value: string): string | null {
  return value.length === 0 ? "Required" : null;
}

export function validateLoginPassword(value: string): string | null {
  return value.length < MIN_PASSWORD_LENGTH ? "Password must be at least 6 characters" : null;
}

export function validateNewPassword(value: string): string | null {
  if (value.length === 0) return "Required";
  return value.length < MIN_PASSWORD_LENGTH ? "6 characters minimum" : null;
}

export function validateConfirmPassword(value: string, password: string): string | null {
  if (value.length === 0) return "Required";
  return value !== password ? "Passwords do not match" : null;
}
