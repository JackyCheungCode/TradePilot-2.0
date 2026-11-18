/** Carbon icon sizes used by TradePilot controls and navigation. */
export const iconSizes = {
  control: 16,
  navigation: 20,
  feature: 24,
} as const;

export type IconSizeName = keyof typeof iconSizes;
