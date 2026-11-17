# Themes

TradePilot uses IBM Carbon theme tokens as the source of truth.

- White maps to Carbon White.
- Dark maps to Carbon G100.
- System resolves to White or G100 using the operating-system color-scheme preference.
- The signed-in account preference is stored in the owner-scoped `theme_preference` settings namespace and synchronized across devices.
- Browser local storage is only a per-account rendering cache; it is not the authoritative preference store.

All global Carbon theme variables are applied at the document root so Carbon portals, dialogs, menus, and popovers inherit the active theme.
