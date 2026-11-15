import { createContext, useContext, type ReactNode } from 'react';

export type DesignSystemTheme = 'white';

const DesignSystemThemeContext = createContext<DesignSystemTheme>('white');

interface DesignSystemProviderProps {
  children: ReactNode;
}

/**
 * Application-wide design-system boundary.
 * Carbon White is the approved theme; adding another theme requires design approval.
 */
export function DesignSystemProvider({ children }: DesignSystemProviderProps) {
  return (
    <DesignSystemThemeContext.Provider value="white">
      <div className="tp-design-system" data-carbon-theme="white">
        {children}
      </div>
    </DesignSystemThemeContext.Provider>
  );
}

export function useDesignSystemTheme(): DesignSystemTheme {
  return useContext(DesignSystemThemeContext);
}
