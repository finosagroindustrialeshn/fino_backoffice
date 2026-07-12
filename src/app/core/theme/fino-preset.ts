import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

/**
 * Fino Agroindustriales brand preset.
 *
 * Built on top of the Aura base preset. Two overrides:
 *  - semantic.primary: the brand green scale (accent-primary #2D5E3A as 500,
 *    accent-secondary #4A8C5E as 400). Direct values, applied in both schemes.
 *  - colorScheme surfaces: warm taupe ramps so neutral tones (borders, muted
 *    text, hovers) match the cream palette from the mocks instead of Aura's
 *    default cold gray. surface-50 is the exact brand cream (#F5F3EE).
 *
 * Surfaces are overridden through colorScheme (light + dark) to keep the same
 * structure Aura uses, otherwise the override would be ignored.
 */
export const FinoPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#f0f6f2',
      100: '#dbe9e0',
      200: '#b8d3c2',
      300: '#8bb89c',
      400: '#4a8c5e',
      500: '#2d5e3a',
      600: '#285435',
      700: '#22462d',
      800: '#1b3a28',
      900: '#16301f',
      950: '#0d1e13',
    },
    colorScheme: {
      light: {
        surface: {
          0: '#ffffff',
          50: '#f5f3ee',
          100: '#ebe8df',
          200: '#dcd7c9',
          300: '#c6bfab',
          400: '#a89f86',
          500: '#8b8168',
          600: '#6f6653',
          700: '#585144',
          800: '#403b31',
          900: '#2b271f',
          950: '#1a1712',
        },
      },
      dark: {
        surface: {
          0: '#ffffff',
          50: '#f7f5f0',
          100: '#efece4',
          200: '#e0dccf',
          300: '#c9c4b6',
          400: '#a49d8b',
          500: '#7c7566',
          600: '#5f594d',
          700: '#403d33',
          800: '#2a2721',
          900: '#1c1a15',
          950: '#12100c',
        },
      },
    },
  },
});
