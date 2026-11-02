import { VIDEO_MAX_MINUTES, VIDEO_MIN_MINUTES, type VideoAgentOutline } from './video-agent.types.js';

/**
 * Runtime a single chapter can carry. Below ~1.5 min a chapter is a stub; above ~4.5 min it is a
 * lecture that needs splitting. This is what stops a short topic being stretched to reach 12 minutes
 * (padding is what reads as generic and repetitive) or a long runtime being poured into too few ideas.
 */
const MIN_CHAPTER_MINUTES = 1.5;
const MAX_CHAPTER_MINUTES = 4.5;

const MIN_ORIGINAL_ELEMENTS = 3;
const MIN_DISTINCT = 3;
const MAX_SAME_FORM = 2;

/**
 * Hard rules on the outline, checked in code before any chapter is written. A script cut from one
 * mould (same form, same opening, no concrete original material) is exactly what reads as
 * mass-produced, so it is rejected here instead of being left to the editor's judgement.
 */
/**
 * Runtime window and chapter budget, shared by the video agent and the manual remake flow so both
 * apply the same rule: the length is the planner's choice, but it must be earned by the material.
 */
export function validateLength(plannedMinutes: number, chapterCount: number): string[] {
  const problems: string[] = [];
  if (plannedMinutes < VIDEO_MIN_MINUTES || plannedMinutes > VIDEO_MAX_MINUTES) {
    problems.push(`Độ dài ${plannedMinutes} phút nằm ngoài khoảng ${VIDEO_MIN_MINUTES}–${VIDEO_MAX_MINUTES} phút.`);
  }
  const perChapter = plannedMinutes / chapterCount;
  if (perChapter < MIN_CHAPTER_MINUTES) {
    const fewer = Math.max(3, Math.floor(plannedMinutes / MIN_CHAPTER_MINUTES));
    problems.push(
      `${plannedMinutes} phút chia cho ${chapterCount} chương chỉ được ${perChapter.toFixed(1)} phút/chương (tối thiểu ${MIN_CHAPTER_MINUTES}). Giảm xuống tối đa ${fewer} chương hoặc tăng độ dài nếu chất liệu đủ.`,
    );
  }
  if (perChapter > MAX_CHAPTER_MINUTES) {
    const need = Math.ceil(plannedMinutes / MAX_CHAPTER_MINUTES);
    problems.push(
      `${plannedMinutes} phút chia cho ${chapterCount} chương là ${perChapter.toFixed(1)} phút/chương (tối đa ${MAX_CHAPTER_MINUTES}). Nếu chất liệu thật sự đủ thì tách thành ít nhất ${need} chương; nếu không thì rút ngắn video, đừng kéo dài cho đủ giờ.`,
    );
  }
  return problems;
}

export function validateOutline(outline: VideoAgentOutline, plannedMinutes: number): string[] {
  const { chapters, spine } = outline;
  const problems = validateLength(plannedMinutes, chapters.length);
  const distinctForms = new Set(chapters.map(chapter => chapter.form));
  const distinctOpenings = new Set(chapters.map(chapter => chapter.openingType));
  const need = Math.min(MIN_DISTINCT, chapters.length);

  if (distinctForms.size < need) {
    problems.push(`Chỉ có ${distinctForms.size} hình thức chương khác nhau; cần ít nhất ${need}.`);
  }
  if (distinctOpenings.size < need) {
    problems.push(`Chỉ có ${distinctOpenings.size} kiểu mở chương khác nhau; cần ít nhất ${need}.`);
  }

  const formCount = new Map<string, number>();
  for (const [index, chapter] of chapters.entries()) {
    const previous = chapters[index - 1];
    if (previous?.form === chapter.form) {
      problems.push(`Chương ${index} và ${index + 1} cùng hình thức "${chapter.form}"; hai chương liền nhau phải khác hình thức.`);
    }
    if (previous?.openingType === chapter.openingType) {
      problems.push(`Chương ${index} và ${index + 1} cùng kiểu mở "${chapter.openingType}"; hai chương liền nhau phải mở khác nhau.`);
    }
    formCount.set(chapter.form, (formCount.get(chapter.form) ?? 0) + 1);
  }
  for (const [form, count] of formCount) {
    if (count > MAX_SAME_FORM) problems.push(`Hình thức "${form}" dùng ${count} lần; tối đa ${MAX_SAME_FORM}.`);
  }

  const elements = spine.originalElements.map(element => element.trim()).filter(element => element.length >= 8);
  if (elements.length < MIN_ORIGINAL_ELEMENTS) {
    problems.push(
      `Cần ít nhất ${MIN_ORIGINAL_ELEMENTS} yếu tố gốc cụ thể (tình huống, cách nhìn lại, bước làm được ngay, nét đời sống Nhật) không có trong nguồn nào; hiện có ${elements.length}.`,
    );
  }
  if (spine.ourTake.trim() === spine.consensus.trim()) {
    problems.push('"ourTake" trùng "consensus": video chưa đi khác hay sâu hơn điều mọi nguồn đều nói.');
  }
  return problems;
}
