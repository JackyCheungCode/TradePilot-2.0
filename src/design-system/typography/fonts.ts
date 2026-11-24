/** IBM Plex typography: SC Chinese glyphs first, IBM Plex Sans for Latin and numerals. */
import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';

// IBM's official Chinese Simplified web font package is served as split WOFF2 subsets.
// The Google Fonts CSS endpoint provides the same family with unicode-range subsetting,
// avoiding shipping the full 100+ MB upstream npm archive to every production build.
import './plex-sans-sc.css';
