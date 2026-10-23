import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fonts, SAFE, type Theme } from "../theme";
import type { Page, Role } from "../types";

type RoleStyle = {
  size: number;
  family: string;
  weight: number;
  italic?: boolean;
  color: (t: Theme) => string;
};

const ROLE_STYLES: Record<Role, RoleStyle> = {
  hook: { size: 86, family: "", weight: 700, color: (t) => t.text },
  line: { size: 70, family: "", weight: 600, color: (t) => t.text },
  myth: { size: 64, family: "", weight: 400, color: (t) => t.muted },
  truth: { size: 74, family: "", weight: 700, color: (t) => t.accent },
  step: { size: 66, family: "", weight: 600, color: (t) => t.text },
  quote: { size: 68, family: fonts.serif, weight: 400, color: (t) => t.text },
  question: { size: 76, family: fonts.serif, weight: 400, italic: true, color: (t) => t.text },
  close: { size: 58, family: "", weight: 400, color: (t) => t.muted },
};

const StepBadge: React.FC<{ n: number; theme: Theme }> = ({ n, theme }) => (
  <div
    style={{
      width: 96,
      height: 96,
      borderRadius: 48,
      border: `3px solid ${theme.accent}`,
      color: theme.accent,
      fontFamily: fonts.sans,
      fontWeight: 600,
      fontSize: 48,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      margin: "0 auto 36px",
    }}
  >
    {n}
  </div>
);

const PageView: React.FC<{ page: Page; theme: Theme; hasNext: boolean }> = ({ page, theme, hasNext }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const startF = page.start * fps;
  const endF = page.end * fps;
  const local = frame - startF;

  const enter = interpolate(local, [0, 10], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  const exit = hasNext ? interpolate(frame, [endF - 6, endF], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) : 1;

  const style = ROLE_STYLES[page.role];
  const long = page.words.length > 6;
  const size = style.size * (long ? 0.88 : 1);
  const family = style.family || theme.font;
  const spokenEnd = page.words[page.words.length - 1]?.end ?? page.end;
  const strike = page.role === "myth"
    ? interpolate(t, [spokenEnd, spokenEnd + 0.5], [0, 100], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;

  return (
    <div style={{ opacity: enter * exit, transform: `translateY(${(1 - enter) * 28}px)`, textAlign: "center" }}>
      {page.role === "step" && page.step ? <StepBadge n={page.step} theme={theme} /> : null}
      {page.role === "truth" ? (
        <div style={{ width: 90, height: 6, borderRadius: 3, background: theme.accent, margin: "0 auto 40px" }} />
      ) : null}
      <div style={{ position: "relative", display: "inline" }}>
        <span
          style={{
            fontFamily: family,
            fontWeight: style.weight,
            fontStyle: style.italic ? "italic" : "normal",
            fontSize: size,
            lineHeight: 1.32,
            color: style.color(theme),
            letterSpacing: page.role === "hook" ? -0.5 : 0,
          }}
        >
          {page.words.map((w, i) => {
            const shown = interpolate(t, [w.start - 0.05, w.start + 0.12], [0.22, 1], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
            return (
              <span
                key={i}
                style={{
                  opacity: shown,
                  color: w.emphasis ? theme.accent : undefined,
                  fontWeight: w.emphasis ? Math.max(style.weight, 700) : undefined,
                }}
              >
                {w.text}
                {i < page.words.length - 1 ? " " : ""}
              </span>
            );
          })}
        </span>
      </div>
      {page.role === "myth" ? (
        <div style={{ height: 4, width: `${strike}%`, background: theme.muted, margin: "24px auto 0", borderRadius: 2 }} />
      ) : null}
    </div>
  );
};

export const Captions: React.FC<{ pages: Page[]; theme: Theme }> = ({ pages, theme }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const index = pages.findIndex((p) => t >= p.start && t < p.end);
  if (index === -1) return null;
  return (
    <AbsoluteFill
      style={{
        paddingTop: SAFE.top,
        paddingBottom: SAFE.bottom,
        paddingLeft: SAFE.left,
        paddingRight: SAFE.right,
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <PageView key={index} page={pages[index]} theme={theme} hasNext={index < pages.length - 1} />
    </AbsoluteFill>
  );
};
