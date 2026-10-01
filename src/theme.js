import { Hct, TonalPalette, DynamicScheme, MaterialDynamicColors, Variant, argbFromHex, hexFromArgb } from '@material/material-color-utilities';

export const SEED = '#00838a';
const TERTIARY_SEED = '#4a5d92';
const OK_SEED = '#2e7d32';
const WARN_SEED = '#8a6a00';

const ROLES = [
  'primary', 'onPrimary', 'primaryContainer', 'onPrimaryContainer',
  'secondary', 'onSecondary', 'secondaryContainer', 'onSecondaryContainer',
  'tertiary', 'onTertiary', 'tertiaryContainer', 'onTertiaryContainer',
  'error', 'onError', 'errorContainer', 'onErrorContainer',
  'surface', 'onSurface', 'surfaceVariant', 'onSurfaceVariant',
  'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer',
  'surfaceContainerHigh', 'surfaceContainerHighest', 'surfaceDim', 'surfaceBright',
  'outline', 'outlineVariant', 'inverseSurface', 'inverseOnSurface', 'inversePrimary',
  'shadow', 'scrim'
];

const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

let palettes = null;

function getPalettes() {
  if (palettes) return palettes;
  const source = Hct.fromInt(argbFromHex(SEED));
  palettes = {
    source,
    primary: TonalPalette.fromHueAndChroma(source.hue, 40),
    secondary: TonalPalette.fromHueAndChroma(source.hue, 16),
    tertiary: TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex(TERTIARY_SEED)).hue, 24),
    neutral: TonalPalette.fromHueAndChroma(source.hue, 3.5),
    neutralVariant: TonalPalette.fromHueAndChroma(source.hue, 8),
    ok: TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex(OK_SEED)).hue, 42),
    warn: TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex(WARN_SEED)).hue, 46)
  };
  return palettes;
}

function schemeFor(isDark, contrastLevel) {
  const tones = getPalettes();
  return new DynamicScheme({
    sourceColorHct: tones.source,
    variant: Variant.tonalSpot,
    contrastLevel,
    isDark,
    primaryPalette: tones.primary,
    secondaryPalette: tones.secondary,
    tertiaryPalette: tones.tertiary,
    neutralPalette: tones.neutral,
    neutralVariantPalette: tones.neutralVariant
  });
}

const tone = (palette, light, dark, isDark) => hexFromArgb(palette.tone(isDark ? dark : light));

export function tokensFor(isDark, contrastLevel) {
  const scheme = schemeFor(isDark, contrastLevel);
  const tones = getPalettes();
  const tokens = {};
  for (const role of ROLES) {
    const color = MaterialDynamicColors[role];
    if (color) tokens[`--md-sys-color-${kebab(role)}`] = hexFromArgb(color.getArgb(scheme));
  }
  tokens['--md-sys-color-background'] = tokens['--md-sys-color-surface'];
  tokens['--md-sys-color-on-background'] = tokens['--md-sys-color-on-surface'];
  tokens['--mi-crit'] = tokens['--md-sys-color-error'];
  tokens['--mi-crit-container'] = tokens['--md-sys-color-error-container'];
  tokens['--mi-on-crit-container'] = tokens['--md-sys-color-on-error-container'];
  tokens['--mi-warn'] = tone(tones.warn, 40, 80, isDark);
  tokens['--mi-warn-container'] = tone(tones.warn, 90, 30, isDark);
  tokens['--mi-on-warn-container'] = tone(tones.warn, 10, 90, isDark);
  tokens['--mi-ok'] = tone(tones.ok, 40, 80, isDark);
  tokens['--mi-ok-container'] = tone(tones.ok, 90, 30, isDark);
  tokens['--mi-on-ok-container'] = tone(tones.ok, 10, 90, isDark);
  tokens['--mi-info'] = tokens['--md-sys-color-primary'];
  tokens['--mi-info-container'] = tokens['--md-sys-color-primary-container'];
  tokens['--mi-on-info-container'] = tokens['--md-sys-color-on-primary-container'];
  tokens['--mi-muted'] = tokens['--md-sys-color-on-surface-variant'];
  tokens['--mi-muted-container'] = tokens['--md-sys-color-surface-container-highest'];
  tokens['--mi-null'] = tokens['--md-sys-color-outline'];
  return tokens;
}

export function resolveMode(preference) {
  if (preference === 'light' || preference === 'dark') return preference;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme({ mode, contrast }) {
  const isDark = resolveMode(mode) === 'dark';
  const root = document.documentElement;
  let tokens;
  try {
    tokens = tokensFor(isDark, contrast);
  } catch {
    tokens = null;
  }
  root.dataset.theme = isDark ? 'dark' : 'light';
  root.dataset.contrast = String(contrast);
  if (tokens) {
    for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  const color = tokens?.['--md-sys-color-surface'] || (isDark ? '#111414' : '#f8faf9');
  if (meta) meta.setAttribute('content', color);
  else {
    const tag = document.createElement('meta');
    tag.name = 'theme-color';
    tag.content = color;
    document.head.append(tag);
  }
  window.dispatchEvent(new CustomEvent('themechange', { detail: { isDark } }));
}

export function contrastLabel(value) {
  if (value >= 1) return 'High contrast';
  if (value >= 0.5) return 'Medium contrast';
  return 'Standard contrast';
}

export function modeLabel(mode) {
  if (mode === 'light') return 'Light';
  if (mode === 'dark') return 'Dark';
  return 'System';
}
