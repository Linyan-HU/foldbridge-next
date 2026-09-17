const COMMON = {
  light: {
    surface: '#FFFFFF',
    surfaceAlt: '#EEF3EE',
    background: '#F4F7F2',
    backgroundStrong: '#E8EFE8',
    textPrimary: '#14221C',
    textSecondary: '#5D6C64',
    textMuted: '#7B8A82',
    onPrimary: '#F4F7F2',
    shadow: '0 18px 50px rgba(20, 34, 28, 0.08)',
    shadowSoft: '0 10px 28px rgba(20, 34, 28, 0.06)',
    radiusCard: '22px',
    radiusPanel: '16px'
  },
  dark: {
    surface: '#111a17',
    surfaceAlt: '#182320',
    background: '#08110e',
    backgroundStrong: '#0d1714',
    textPrimary: '#edf4ef',
    textSecondary: '#b8c8bf',
    textMuted: '#8ea196',
    onPrimary: '#08110e',
    shadow: '0 18px 50px rgba(0, 0, 0, 0.34)',
    shadowSoft: '0 10px 28px rgba(0, 0, 0, 0.28)',
    radiusCard: '22px',
    radiusPanel: '16px'
  }
};

export const themeTokens = {
  ribocentre: {
    label: 'RiboCentre Blue',
    light: {
      primary: '#1D4ED8',
      primaryHover: '#1E40AF',
      primarySoft: '#DBEAFE',
      accent: '#0891B2',
      accentSoft: '#CFFAFE',
      border: 'rgba(224, 174, 36, 0.68)'
    },
    dark: {
      primary: '#93C5FD',
      primaryHover: '#BFDBFE',
      primarySoft: 'rgba(147, 197, 253, 0.14)',
      accent: '#67E8F9',
      accentSoft: '#164E63',
      border: 'rgba(224, 174, 36, 0.68)'
    }
  },
  riboswitch: {
    label: 'Riboswitch Teal-Green',
    light: {
      primary: '#174B3A',
      primaryHover: '#123B2E',
      primarySoft: '#E4EFE8',
      accent: '#2F8F6B',
      accentSoft: '#C7E36B',
      border: 'rgba(224, 174, 36, 0.68)'
    },
    dark: {
      primary: '#7dd4aa',
      primaryHover: '#99e0bd',
      primarySoft: 'rgba(125, 212, 170, 0.14)',
      accent: '#63cfa0',
      accentSoft: '#d9e99d',
      border: 'rgba(224, 174, 36, 0.68)'
    }
  },
  aptamer: {
    label: 'Aptamer Purple-Indigo',
    light: {
      primary: '#6D28D9',
      primaryHover: '#5B21B6',
      primarySoft: '#EDE9FE',
      accent: '#C026D3',
      accentSoft: '#FAE8FF',
      border: 'rgba(224, 174, 36, 0.68)'
    },
    dark: {
      primary: '#C4B5FD',
      primaryHover: '#DDD6FE',
      primarySoft: 'rgba(196, 181, 253, 0.14)',
      accent: '#F0ABFC',
      accentSoft: '#581C87',
      border: 'rgba(224, 174, 36, 0.68)'
    }
  }
};

export function cssVarsFor(themeKey, mode = 'light') {
  const theme = themeTokens[themeKey] ?? themeTokens.ribocentre;
  const safeMode = mode === 'dark' ? 'dark' : 'light';
  const merged = { ...COMMON[safeMode], ...theme[safeMode] };
  const entries = Object.entries(merged).map(([k, v]) => `--${k}: ${v};`);
  entries.push(`--mode: ${safeMode};`);
  return entries.join('\n');
}
