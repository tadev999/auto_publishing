import React from "react";
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  random,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Theme } from "../theme";

const Grain: React.FC = () => (
  <AbsoluteFill style={{ opacity: 0.08, mixBlendMode: "overlay" }}>
    <svg width="100%" height="100%">
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  </AbsoluteFill>
);

/** Warm gradient with a slowly drifting light, like late-afternoon sun on paper. */
export const PaperBackground: React.FC<{ theme: Theme; seed: number }> = ({ theme, seed }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const startX = 30 + random(`x-${seed}`) * 40;
  const x = interpolate(frame, [0, durationInFrames], [startX, startX + 12]);
  const y = interpolate(frame, [0, durationInFrames], [28, 40]);
  return (
    <AbsoluteFill
      style={{ background: `linear-gradient(170deg, ${theme.background[0]} 0%, ${theme.background[1]} 100%)` }}
    >
      <AbsoluteFill
        style={{ background: `radial-gradient(circle at ${x}% ${y}%, ${theme.glow} 0%, rgba(0,0,0,0) 55%)` }}
      />
      <Grain />
    </AbsoluteFill>
  );
};

const FADE = 18;

const Clip: React.FC<{ src: string; length: number; first: boolean }> = ({ src, length, first }) => {
  const frame = useCurrentFrame();
  const opacity = first ? 1 : interpolate(frame, [0, FADE], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(frame, [0, length], [1.04, 1.12]);
  return (
    <AbsoluteFill style={{ opacity }}>
      <OffthreadVideo
        src={staticFile(src)}
        muted
        playbackRate={0.8}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
      />
    </AbsoluteFill>
  );
};

/** Slow stock clips with gentle cross-fades and a darkening overlay for legibility. */
export const StockBackground: React.FC<{ theme: Theme; clips: string[]; seed: number }> = ({ theme, clips, seed }) => {
  const { durationInFrames } = useVideoConfig();
  if (clips.length === 0) {
    return <PaperBackground theme={theme} seed={seed} />;
  }
  const segment = Math.ceil(durationInFrames / clips.length);
  return (
    <AbsoluteFill style={{ backgroundColor: theme.background[0] }}>
      {clips.map((clip, i) => {
        const from = Math.max(0, i * segment - (i > 0 ? FADE : 0));
        const length = segment + (i > 0 ? FADE : 0);
        return (
          <Sequence key={clip} from={from} durationInFrames={length}>
            <Clip src={clip} length={length} first={i === 0} />
          </Sequence>
        );
      })}
      {theme.overlay ? <AbsoluteFill style={{ background: theme.overlay }} /> : null}
      <Grain />
    </AbsoluteFill>
  );
};
