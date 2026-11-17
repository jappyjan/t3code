import type { IssueState, IssueStateType } from "@t3tools/contracts";

/** Linear's own colours per workflow type, for a state that arrives without one. */
const ISSUE_STATE_DEFAULT_COLORS: Record<IssueStateType, string> = {
  triage: "#fc7840",
  backlog: "#bec2c8",
  unstarted: "#9aa0a6",
  started: "#f2c94c",
  completed: "#5e6ad2",
  canceled: "#95a2b3",
  duplicate: "#95a2b3",
};

/** Used for a state colour that would vanish on the theme's background. */
const NEUTRAL_INK = "#9ca3af";
const SYMBOL_INK = "#ffffff";
/** Without the team's started states, a started state reads as half done. */
const DEFAULT_STARTED_FILL = 0.5;

type IssueGlyphPrimitive =
  | {
      readonly tag: "circle";
      readonly key: string;
      readonly cx: number;
      readonly cy: number;
      readonly r: number;
      readonly fill: string | null;
      readonly stroke: string | null;
      readonly strokeWidth: number;
      readonly dash: string | null;
    }
  | {
      readonly tag: "path";
      readonly key: string;
      readonly d: string;
      readonly fill: string | null;
      readonly stroke: string | null;
      readonly strokeWidth: number;
    };

interface IssueStateGlyph {
  readonly type: IssueStateType;
  readonly label: string;
  readonly color: string;
  /** Drawn in a 16 × 16 box, so web and mobile share one set of shapes. */
  readonly viewBox: 16;
  readonly primitives: ReadonlyArray<IssueGlyphPrimitive>;
}

/** Relative luminance and chroma (0..255 channel spread) of a `#rrggbb` colour. */
function inkOf(hex: string): { readonly luminance: number; readonly chroma: number } | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (match === null) return null;
  const value = Number.parseInt(match[1]!, 16);
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255];
  const channel = (shift: number) => {
    const c = ((value >> shift) & 255) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return {
    luminance: 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0),
    chroma: Math.max(...channels) - Math.min(...channels),
  };
}

/** The state's colour, or its type's default; a colour too pale or too dark for the theme goes neutral. */
function issueStateColor(
  state: Pick<IssueState, "type" | "color">,
  scheme: "light" | "dark",
): string {
  const type = state.type ?? "unstarted";
  const color = state.color?.trim() || ISSUE_STATE_DEFAULT_COLORS[type];
  const ink = inkOf(color);
  if (ink === null) return ISSUE_STATE_DEFAULT_COLORS[type];
  // Only a grey can vanish: Linear's yellow and green stay readable on both themes.
  const grey = ink.chroma < 24;
  if (grey && scheme === "light" && ink.luminance > 0.6) return NEUTRAL_INK;
  if (grey && scheme === "dark" && ink.luminance < 0.03) return NEUTRAL_INK;
  return color.startsWith("#") ? color : `#${color}`;
}

function startedStateFill(state: Pick<IssueState, "startedFill">): number {
  const fill = state.startedFill;
  return fill !== undefined && Number.isFinite(fill) && fill > 0 && fill < 1
    ? fill
    : DEFAULT_STARTED_FILL;
}

const CENTER = 8;
const CHECK = "M5 8.3 L7.1 10.4 L11 5.9";
const CROSS = "M5.7 5.7 L10.3 10.3 M10.3 5.7 L5.7 10.3";
// An arrow into a bar: Linear's triage mark.
const TRIAGE = "M4.8 8 H10.4 M8.3 5.8 L10.5 8 L8.3 10.2 M11.6 5.6 V10.4";

function pie(fill: number, color: string): IssueGlyphPrimitive {
  const radius = 3;
  const angle = 2 * Math.PI * fill;
  const x = (CENTER + radius * Math.sin(angle)).toFixed(3);
  const y = (CENTER - radius * Math.cos(angle)).toFixed(3);
  const large = fill > 0.5 ? 1 : 0;
  return {
    tag: "path",
    key: "pie",
    d: `M${CENTER} ${CENTER} L${CENTER} ${CENTER - radius} A${radius} ${radius} 0 ${large} 1 ${x} ${y} Z`,
    fill: color,
    stroke: null,
    strokeWidth: 0,
  };
}

const ring = (color: string, dash: string | null = null): IssueGlyphPrimitive => ({
  tag: "circle",
  key: "ring",
  cx: CENTER,
  cy: CENTER,
  r: 6,
  fill: null,
  stroke: color,
  strokeWidth: 1.5,
  dash,
});

const disc = (color: string): IssueGlyphPrimitive => ({
  tag: "circle",
  key: "disc",
  cx: CENTER,
  cy: CENTER,
  r: 7,
  fill: color,
  stroke: null,
  strokeWidth: 0,
  dash: null,
});

const mark = (d: string): IssueGlyphPrimitive => ({
  tag: "path",
  key: "mark",
  d,
  fill: null,
  stroke: SYMBOL_INK,
  strokeWidth: 1.6,
});

/**
 * Linear's status glyph for a state, or null when the tracker reports no workflow type (git
 * hosts), which keep their open and closed marks.
 */
export function issueStateGlyph(
  state: IssueState,
  scheme: "light" | "dark",
): IssueStateGlyph | null {
  const type = state.type;
  if (type === undefined) return null;
  const color = issueStateColor(state, scheme);
  const primitives: ReadonlyArray<IssueGlyphPrimitive> = (() => {
    switch (type) {
      case "backlog":
        return [ring(color, "2.356 2.356")];
      case "unstarted":
        return [ring(color)];
      case "started":
        return [ring(color), pie(startedStateFill(state), color)];
      case "completed":
        return [disc(color), mark(CHECK)];
      case "canceled":
      case "duplicate":
        return [disc(color), mark(CROSS)];
      case "triage":
        return [disc(color), mark(TRIAGE)];
    }
  })();
  return { type, label: state.name, color, viewBox: 16, primitives };
}
