export type FormatId = "cau-hoi" | "goi-ten" | "ngo-nhan" | "thuc-hanh" | "doc-cham";

export type Role = "hook" | "line" | "myth" | "truth" | "step" | "quote" | "question" | "close";

export type Word = {
  text: string;
  start: number;
  end: number;
  beat: number;
  emphasis: boolean;
};

export type Page = {
  beat: number;
  role: Role;
  start: number;
  end: number;
  words: Word[];
  step: number | null;
};

export type VideoProps = {
  format: FormatId;
  label: string;
  episode: number;
  handle: string;
  pages: Page[];
  durationInSeconds: number;
  voice: string | null;
  music: string | null;
  musicVolume: number;
  clips: string[];
  seed: number;
};
