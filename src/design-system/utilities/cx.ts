/** Compose conditional class names without introducing a third-party dependency. */
export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
