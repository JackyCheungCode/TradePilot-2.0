/** Approved Carbon icon sizes. Prefer the size that matches the surrounding Carbon control. */
export const iconSizes = {
  small: 16,
  medium: 20,
  large: 24,
  extraLarge: 32,
} as const;

export type IconSizeName = keyof typeof iconSizes;
