/** Typography foundation entry point. */
export const typography = {
  fontFamily: 'var(--tp-font-family-sans)',
  weights: {
    regular: 'var(--tp-font-weight-regular)',
    medium: 'var(--tp-font-weight-medium)',
    semibold: 'var(--tp-font-weight-semibold)',
  },
  tokens: {
    bodyFontSize: 'var(--tp-type-body-font-size)',
    bodyLineHeight: 'var(--tp-type-body-line-height)',
    labelFontSize: 'var(--tp-type-label-font-size)',
    labelLineHeight: 'var(--tp-type-label-line-height)',
  },
} as const;
