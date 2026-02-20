import type { IonicColor } from './color.model';

export type EmptyStateColor = Extract<IonicColor, 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'danger' | 'medium'>;
