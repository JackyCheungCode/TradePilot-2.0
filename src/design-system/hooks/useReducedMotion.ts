import { useMediaQuery } from './useMediaQuery';

/** True when the operating system requests reduced motion. */
export function useReducedMotion(): boolean {
  return useMediaQuery('(prefers-reduced-motion: reduce)');
}
