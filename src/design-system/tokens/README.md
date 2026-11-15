# Design tokens

Tokens are split by semantic responsibility: color, spacing, typography, motion, breakpoints, layers, elevation, z-index, and focus. The Carbon White theme is applied separately from `themes/`. Application styles consume `--tp-*` aliases or Carbon `--cds-*` tokens; feature modules must never declare their own token values.
