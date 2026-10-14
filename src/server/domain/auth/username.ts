// Login names ("naren", "sadmin", "production"). Pure — no IO.
// Stored lowercase with single spaces; login is case-insensitive.
export const normalizeUsername = (raw: string) => raw.trim().replace(/\s+/g, " ").toLowerCase();

export function usernameError(raw: string): string | null {
  const u = normalizeUsername(raw);
  if (u.length < 2 || u.length > 40) return "Username must be 2–40 characters.";
  if (!/^[a-z0-9 ._-]+$/.test(u)) return "Use letters, numbers, spaces, dot, dash or underscore only.";
  return null;
}

export const looksLikeEmail = (raw: string) => /^\S+@\S+\.\S+$/.test(raw.trim());
