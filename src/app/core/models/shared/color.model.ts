/**
 * Common color values used across the application.
 * Includes Ionic color names and allows custom color strings.
 */
export type IonicColor = 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'danger' | 'medium' | 'light' | 'dark';

/**
 * Generic color value type that accepts Ionic colors or any custom string (e.g., hex colors).
 */
export type ColorValue = IonicColor | (string & {});

/**
 * Color values commonly used for UI status indicators (badges, chips, etc.)
 */
export type StatusColor = 'danger' | 'warning' | 'success' | 'medium';
