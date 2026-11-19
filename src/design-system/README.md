# TradePilot Design System

The local design system is the only approved source for visual foundations and UI primitives. Feature pages compose these resources; they do not redefine them.

## Foundations

- `themes/`: official IBM Carbon White, G10, G90 and G100 theme definitions.
- `tokens/`: semantic color, borders, spacing, typography, motion, breakpoint, layer, elevation, z-index, focus, and interaction-state aliases.
- `typography/`: IBM Plex Sans font loading and type-scale aliases.
- `icons/`: Carbon icon entry point.
- `grid/`: responsive grid and breakpoint guidance.
- `motion/`, `elevation/`, `borders/`, `states/`, `density/`, `accessibility/`: cross-cutting interaction and visual rules.
- `assets/`, `content/`, `data-visualization/`: brand assets, shared content/localization, and chart foundations.

## Implementation layers

- `components/<Component>/`: local entry points for Carbon React primitives.
- `layout/<Element>/`: Header, SideNav, Content, AppShell and other structural elements.
- `patterns/`: approved reusable interaction compositions.
- `providers/`: application-level design-system and localization providers.
- `hooks/`, `utilities/`: generic shared behavior and helpers.
- `styles/`: global Carbon stylesheet entry and application-wide styles.

## Import policy

Preferred:

```ts
import { Button, TextInput, Dropdown, Header } from '@/design-system';
import { Search, Add } from '@/design-system/icons';
```

Component-specific imports are also allowed:

```ts
import { Button } from '@/design-system/components/Button';
import { Header } from '@/design-system/layout/Header';
```

Forbidden outside `src/design-system/**`:

- Direct imports from `@carbon/react`, `@carbon/icons-react`, or other icon libraries.
- Direct imports from `@fontsource/*`.
- New font families, colors, spacing scales, shadows, radii, breakpoints, or z-index values.
- Inline visual styles and feature-owned CSS declarations.
- Page-specific copies of shared components or design tokens.

These are local entry points and wrappers, not copied or forked Carbon source. Carbon remains the implementation and accessibility source of truth.
