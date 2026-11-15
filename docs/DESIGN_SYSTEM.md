# TradePilot Design System Standard

## Single source of truth

All UI primitives, visual foundations, and shared interaction rules are owned by `src/design-system/`. Product features may compose these resources but must not create parallel design systems or page-specific visual primitives.

## Foundations

- Themes: IBM Carbon White is the only approved theme.
- Tokens: semantic color, spacing, typography, motion, breakpoints, layers, elevation, z-index, and focus.
- Typography: IBM Plex Sans only; font files are loaded through the design-system typography entry.
- Icons: Carbon icon library only, through the local icon entry.
- Grid: Carbon Grid and centralized responsive breakpoints.
- Accessibility: Carbon semantics, keyboard operation, visible focus, screen-reader support, and reduced-motion behavior.
- Assets and content: approved brand assets, canonical terminology, and localization resources.
- Data visualization: semantic chart tokens and Carbon visualization guidance; no chart library is approved yet.

## Implementation layers

- `components/`: one local entry directory per Carbon control or component family.
- `layout/`: Header, SideNav, Content, AppShell, and shared structural elements.
- `patterns/`: approved compositions of Carbon-native components.
- `providers/`: global design-system and localization providers.
- `hooks/` and `utilities/`: generic shared behavior only.
- `styles/`: the single global stylesheet entry.

## Required imports

Use:

```ts
import { Button, TextInput, Dropdown, Header } from '@/design-system';
import { Search, Add } from '@/design-system/icons';
```

Never import Carbon, icon packages, or font packages directly from product features. Only `src/design-system/**` may import those packages.

## Styling policy

Feature modules must not define their own CSS/SCSS declarations, inline style objects, font stacks, colors, spacing scales, shadows, radii, breakpoints, or z-index values. Compose Carbon components and Grid primitives, and consume the centralized token system through the design-system layer.

## Quality gate

Every change must pass:
1. Carbon import boundary check.
2. Design-system styling boundary check.
3. TypeScript and Vite production build.
4. Carbon component/API compatibility review.
5. Accessibility and responsive-layout review before a page is accepted.

The local entries are thin wrappers/re-exports, not copied Carbon source. Carbon remains the component implementation and accessibility source of truth.
