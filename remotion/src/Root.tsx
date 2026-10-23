import React from "react";
import { Composition } from "remotion";
import { EndoVideo } from "./EndoVideo";
import { sampleProps } from "./sample";
import type { FormatId, VideoProps } from "./types";

const FPS = 30;
const FORMATS: FormatId[] = ["cau-hoi", "goi-ten", "ngo-nhan", "thuc-hanh", "doc-cham"];

export const RemotionRoot: React.FC = () => (
  <>
    {FORMATS.map((format) => (
      <Composition
        key={format}
        id={format}
        component={EndoVideo}
        width={1080}
        height={1920}
        fps={FPS}
        durationInFrames={FPS * 30}
        defaultProps={sampleProps(format)}
        calculateMetadata={({ props }: { props: VideoProps }) => ({
          durationInFrames: Math.ceil(props.durationInSeconds * FPS),
        })}
      />
    ))}
  </>
);
