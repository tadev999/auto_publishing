import React from "react";
import { AbsoluteFill, Audio, interpolate, staticFile, useVideoConfig } from "remotion";
import { PaperBackground, StockBackground } from "./components/Background";
import { Captions } from "./components/Captions";
import { EndCard, SeriesTag } from "./components/Overlays";
import { themes } from "./theme";
import type { VideoProps } from "./types";

export const EndoVideo: React.FC<VideoProps> = (props) => {
  const { fps, durationInFrames } = useVideoConfig();
  const theme = themes[props.format];
  const stock = theme.overlay !== null;
  const lastPage = props.pages[props.pages.length - 1];
  const speechEnd = lastPage?.words[lastPage.words.length - 1]?.end ?? props.durationInSeconds;
  const fadeOut = Math.round(1.2 * fps);

  return (
    <AbsoluteFill>
      {stock ? (
        <StockBackground theme={theme} clips={props.clips} seed={props.seed} />
      ) : (
        <PaperBackground theme={theme} seed={props.seed} />
      )}
      <SeriesTag label={props.label} episode={props.episode} theme={theme} />
      <Captions pages={props.pages} theme={theme} />
      <EndCard handle={props.handle} theme={theme} startSeconds={speechEnd + 0.2} />
      {props.voice ? <Audio src={staticFile(props.voice)} /> : null}
      {props.music ? (
        <Audio
          src={staticFile(props.music)}
          loop
          volume={(f) =>
            props.musicVolume *
            interpolate(f, [0, 20, durationInFrames - fadeOut, durationInFrames], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })
          }
        />
      ) : null}
    </AbsoluteFill>
  );
};
