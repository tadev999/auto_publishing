import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { fonts, SAFE, type Theme } from "../theme";

/** Small series label at the top, e.g. "GỌI TÊN · #12", so viewers can follow a series. */
export const SeriesTag: React.FC<{ label: string; episode: number; theme: Theme }> = ({ label, episode, theme }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 0.75], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ top: SAFE.top - 90, left: SAFE.left, right: SAFE.right, height: 60, alignItems: "center" }}>
      <div
        style={{
          opacity,
          fontFamily: fonts.sans,
          fontWeight: 600,
          fontSize: 30,
          letterSpacing: 6,
          textTransform: "uppercase",
          color: theme.muted,
        }}
      >
        {label} · #{episode}
      </div>
    </AbsoluteFill>
  );
};

/** Brand handle fading in during the silent tail after the narration. */
export const EndCard: React.FC<{ handle: string; theme: Theme; startSeconds: number }> = ({ handle, theme, startSeconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const from = startSeconds * fps;
  const opacity = interpolate(frame, [from, from + 12], [0, 0.9], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  if (!handle) return null;
  return (
    <AbsoluteFill style={{ top: undefined, bottom: SAFE.bottom - 40, height: 60, alignItems: "center", left: SAFE.left, right: SAFE.right }}>
      <div style={{ opacity, fontFamily: fonts.sans, fontSize: 34, letterSpacing: 2, color: theme.accent }}>{handle}</div>
    </AbsoluteFill>
  );
};
