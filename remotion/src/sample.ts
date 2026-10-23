import type { FormatId, Page, Role, VideoProps } from "./types";

type SampleBeat = [Role, string, string[]?];

/** Synthetic timings so templates can be previewed in Remotion Studio without TTS. */
const makePages = (beats: SampleBeat[], secondsPerWord = 0.42, pause = 0.35): { pages: Page[]; end: number } => {
  const pages: Page[] = [];
  let t = 0.3;
  let step = 0;
  beats.forEach(([role, text, emphasis = []], beat) => {
    const emph = new Set(emphasis.flatMap((e) => e.toLowerCase().split(" ")));
    const words = text.split(" ").map((w) => {
      const word = {
        text: w,
        start: t,
        end: t + secondsPerWord * 0.9,
        beat,
        emphasis: emph.has(w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "")),
      };
      t += secondsPerWord;
      return word;
    });
    if (role === "step") step += 1;
    pages.push({ beat, role, start: words[0].start, end: t + pause, words, step: role === "step" ? step : null });
    t += pause;
  });
  pages.forEach((p, i) => {
    if (pages[i + 1]) p.end = pages[i + 1].start;
  });
  return { pages, end: t };
};

const SAMPLES: Record<FormatId, { label: string; beats: SampleBeat[] }> = {
  "cau-hoi": {
    label: "Câu hỏi mang theo",
    beats: [
      ["hook", "Trước khi mở điện thoại sáng nay…"],
      ["line", "Thử dừng lại năm giây."],
      ["question", "Hôm nay, bạn muốn hành động từ nỗi sợ hay từ chỗ đứng vững?", ["nỗi sợ", "đứng vững"]],
      ["close", "Không cần trả lời ngay. Chỉ cần mang theo."],
    ],
  },
  "goi-ten": {
    label: "Gọi tên",
    beats: [
      ["hook", "Bạn ngủ đủ. Nhưng sáng dậy vẫn mệt.", ["mệt"]],
      ["line", "Không phải mệt ở mắt hay tay chân.", []],
      ["line", "Mà là một thứ sâu hơn, không có địa chỉ.", ["địa chỉ"]],
      ["line", "Có thể bạn đang cố quá lâu để trở thành một phiên bản chưa chắc là thật.", ["thật"]],
      ["question", "Mình đang mệt vì điều gì thật sự?", ["thật"]],
    ],
  },
  "ngo-nhan": {
    label: "Ngộ nhận & Sự thật",
    beats: [
      ["hook", "Nghỉ ngơi không chữa được kiểu mệt này."],
      ["myth", "Người ta nói: mệt thì nghỉ một tuần là khỏe."],
      ["truth", "Nhưng có kiểu mệt đến từ nỗi sợ không đủ.", ["nỗi sợ"]],
      ["line", "Nghỉ xong, cỗ máy lại chạy tiếp.", ["cỗ máy"]],
      ["question", "Bạn đang chạy bằng nhiên liệu gì?"],
    ],
  },
  "thuc-hanh": {
    label: "Thực hành 60 giây",
    beats: [
      ["hook", "Bạn không cần làm điều gì lớn tối nay."],
      ["line", "Chỉ một hành động nhỏ, như một lời nói với chính mình."],
      ["step", "Đặt tay lên ngực, thở chậm ba lần.", ["thở chậm"]],
      ["step", "Hỏi: hôm nay mình đã mệt vì điều gì?"],
      ["step", "Gọi tên nó, không cần sửa.", ["không cần sửa"]],
      ["close", "Nếu muốn, thử một lần tối nay."],
    ],
  },
  "doc-cham": {
    label: "Đọc chậm",
    beats: [
      ["hook", "Cái mệt mỏi bạn đang cảm thấy không phải là thứ bạn là."],
      ["quote", "Nó là thứ đang xảy ra với bạn."],
      ["quote", "Và giữa hai điều đó có một khoảng cách rất lớn.", ["khoảng cách"]],
      ["close", "Ngủ ngon. Bạn đủ rồi."],
    ],
  },
};

export const sampleProps = (format: FormatId): VideoProps => {
  const { label, beats } = SAMPLES[format];
  const { pages, end } = makePages(beats);
  return {
    format,
    label,
    episode: 1,
    handle: "@noisinh",
    pages,
    durationInSeconds: end + 1.8,
    voice: null,
    music: null,
    musicVolume: 0.12,
    clips: [],
    seed: 1,
  };
};
