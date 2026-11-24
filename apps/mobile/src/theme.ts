export const colors = {
  light: {
    bg: '#F3F1EC',
    surface: '#FFFFFF',
    ink: '#14201A',
    muted: '#5C6B63',
    accent: '#0F6A4B',
    accentSoft: '#D7EEE4',
    danger: '#B42318',
    warning: '#B54708',
    micIdle: '#0F6A4B',
    micActive: '#C4320A',
    border: '#D9E0DB',
  },
  dark: {
    bg: '#0E1612',
    surface: '#18241E',
    ink: '#E8F0EB',
    muted: '#9BB0A5',
    accent: '#3DCF9A',
    accentSoft: '#1D3A2F',
    danger: '#F97066',
    warning: '#FDB022',
    micIdle: '#3DCF9A',
    micActive: '#F97066',
    border: '#2A3A32',
  },
};

export type ThemeColors = typeof colors.light;