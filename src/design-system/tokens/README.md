# Design tokens

Tokens are split by semantic responsibility: color, borders, spacing, typography, motion, breakpoints, layers, elevation, z-index, focus, and interaction states. The Carbon White theme is applied separately from `themes/`. Application styles consume `--tp-*` aliases or Carbon `--cds-*` tokens; feature modules must never declare their own token values.

Use background layers to establish hierarchy and reserve borders for necessary structure. Use Carbon component size props rather than inventing local control heights or padding.
