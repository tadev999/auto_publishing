import { loadFont } from "@remotion/fonts";
import beVietnamBold from "./fonts/BeVietnamPro-Bold.ttf";
import beVietnamRegular from "./fonts/BeVietnamPro-Regular.ttf";
import beVietnamSemiBold from "./fonts/BeVietnamPro-SemiBold.ttf";
import loraItalic from "./fonts/Lora-Italic.ttf";
import lora from "./fonts/Lora.ttf";
import type { FormatId } from "./types";

// Fonts are bundled (SIL OFL) so rendering never depends on a network call.
const SANS = "Be Vietnam Pro";
const SERIF = "Lora";
loadFont({ family: SANS, url: beVietnamRegular, weight: "400" });
loadFont({ family: SANS, url: beVietnamSemiBold, weight: "600" });
loadFont({ family: SANS, url: beVietnamBold, weight: "700" });
loadFont({ family: SERIF, url: lora, weight: "400 700" });
loadFont({ family: SERIF, url: loraItalic, weight: "400 700", style: "italic" });

export const fonts = {
  sans: `"${SANS}", sans-serif`,
  serif: `"${SERIF}", serif`,
};

export type Theme = {
  background: [string, string];
  glow: string;
  text: string;
  muted: string;
  accent: string;
  font: string;
  /** Darkening layer over stock footage; null for typographic formats. */
  overlay: string | null;
};

export const themes: Record<FormatId, Theme> = {
  "cau-hoi": {
    background: ["#F4ECDF", "#E6D5BB"],
    glow: "rgba(255, 244, 222, 0.9)",
    text: "#2E2A24",
    muted: "#7A6E60",
    accent: "#B0602A",
    font: fonts.sans,
    overlay: null,
  },
  "goi-ten": {
    background: ["#2A2420", "#3D3129"],
    glow: "rgba(224, 169, 109, 0.18)",
    text: "#F3EADD",
    muted: "#A89A8A",
    accent: "#E3AA6E",
    font: fonts.sans,
    overlay: "linear-gradient(180deg, rgba(24,18,14,0.55) 0%, rgba(24,18,14,0.45) 50%, rgba(24,18,14,0.7) 100%)",
  },
  "ngo-nhan": {
    background: ["#1E2926", "#2E3D37"],
    glow: "rgba(217, 178, 111, 0.15)",
    text: "#EFE8DA",
    muted: "#8C978F",
    accent: "#DDB673",
    font: fonts.sans,
    overlay: null,
  },
  "thuc-hanh": {
    background: ["#2B2620", "#3A3027"],
    glow: "rgba(242, 195, 139, 0.15)",
    text: "#FFF8EC",
    muted: "#D8CCBB",
    accent: "#F2C38B",
    font: fonts.sans,
    overlay: "linear-gradient(180deg, rgba(18,14,10,0.55) 0%, rgba(18,14,10,0.45) 45%, rgba(18,14,10,0.7) 100%)",
  },
  "doc-cham": {
    background: ["#22201D", "#33302B"],
    glow: "rgba(232, 199, 160, 0.14)",
    text: "#FBF4E6",
    muted: "#CFC4B4",
    accent: "#EBC9A1",
    font: fonts.serif,
    overlay: "linear-gradient(180deg, rgba(14,12,10,0.5) 0%, rgba(14,12,10,0.4) 50%, rgba(14,12,10,0.65) 100%)",
  },
};

/** Area kept clear of TikTok/Reels UI (top bar, caption + buttons at the bottom, action rail on the right). */
export const SAFE = { top: 250, bottom: 520, left: 90, right: 170 };
