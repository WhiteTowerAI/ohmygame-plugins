// A jam's deadline. The plugin has no timer: its host stops after a few idle
// minutes. So it reminds at the first turn that ends within the last day, once
// per deadline; a panel left open counts down and asks on its own.

export const REMIND_BEFORE_MS = 24 * 60 * 60 * 1000;

export function jamKey(jam: { deadline: string }): string {
  return new Date(jam.deadline).toISOString();
}

export function shouldRemind(jam: { deadline: string } | undefined, reminded: readonly string[], now: Date): boolean {
  if (!jam) return false;
  const deadline = Date.parse(jam.deadline);
  if (Number.isNaN(deadline)) return false;
  const left = deadline - now.getTime();
  return left > 0 && left <= REMIND_BEFORE_MS && !reminded.includes(jamKey(jam));
}

/** Time left, rounded down, as days, hours and minutes. */
export function timeLeft(deadline: string, now: Date): { days: number; hours: number; minutes: number; over: boolean } {
  const left = Date.parse(deadline) - now.getTime();
  if (!(left > 0)) return { days: 0, hours: 0, minutes: 0, over: true };
  const minutes = Math.floor(left / 60_000);
  return { days: Math.floor(minutes / 1440), hours: Math.floor((minutes % 1440) / 60), minutes: minutes % 60, over: false };
}
