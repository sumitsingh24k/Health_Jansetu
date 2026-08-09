/**
 * Chart colour tokens.
 *
 * The chrome is a warm off-white (#f4f6f3) with a deep green brand, and the marks are
 * tuned against that surface rather than against pure white.
 *
 * Slots 1 and 2 are separated by lightness first and hue second (L* 44 vs L* 63), so a
 * red-green colourblind reader still reads two distinct lines — hue alone was never
 * enough, and every series that uses them also ships a legend and a direct label.
 */

/** Categorical slots, in fixed order. Never cycle past the end — fold into "Other". */
export const SERIES = {
  1: "#147a4c", // deep green — the primary count
  2: "#e07a4f", // clay orange — the secondary/critical count
};

/** Single-hue ramps for magnitude bars, light -> dark. */
export const SEQUENTIAL_BLUE = {
  200: "#9ec5f4",
  350: "#5598e7",
  450: "#2a78d6",
  550: "#1c5cab",
};

/** Brand ramp used for case-count bars. */
export const SEQUENTIAL_GREEN = {
  200: "#a8dcc0",
  350: "#5cb98a",
  450: "#2ea86f",
  550: "#147a4c",
};

export const SEQUENTIAL_ORANGE = "#d96f43";

/**
 * Reserved status colours — never reused as a series.
 * Warning and serious fall below 3:1 on a light surface by design, so every use
 * ships with a text label beside it, never colour alone.
 */
export const STATUS = {
  good: "#147a4c",
  warning: "#c2933d",
  serious: "#e07a4f",
  critical: "#d9534f",
};

export const RISK_COLOR = {
  LOW: STATUS.good,
  MEDIUM: STATUS.warning,
  HIGH: STATUS.critical,
};

/** Recessive chrome so the data stays the loudest thing on the canvas. */
export const CHART_INK = {
  grid: "#eef1ec",
  axis: "#c8d6cc",
  label: "#7a8c80",
  strong: "#42544a",
  surface: "#ffffff",
};
