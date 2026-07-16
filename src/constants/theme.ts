export const colors = {
  background: '#141315',
  card: '#211f22',
  surface: '#2b282d',
  surfaceRaised: '#353139',
  text: '#fbfaf8',
  textMuted: '#aaa5ad',
  primary: '#ff7648',
  primaryMuted: '#3b2119',
  primaryText: '#1a0d08',
  border: '#3a363d',
  input: '#302d32',
  success: '#58cc8a',
  warning: '#f2bd62',
  destructive: '#ed6675',
  destructiveMuted: '#3b1e24',
  white: '#ffffff',
  black: '#000000',
  transparent: 'transparent',
} as const;

export const fonts = {
  sans: 'SpaceGrotesk_400Regular',
  sansMedium: 'SpaceGrotesk_500Medium',
  sansSemibold: 'SpaceGrotesk_600SemiBold',
  sansBold: 'SpaceGrotesk_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
  monoSemibold: 'JetBrainsMono_600SemiBold',
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const shadow = {
  shadowColor: colors.black,
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.2,
  shadowRadius: 18,
  elevation: 5,
} as const;
