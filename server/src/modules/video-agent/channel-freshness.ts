import { ngramContainment, SIMILARITY_LIMITS } from './similarity.js';
import { videoAgentRepository } from './video-agent.repository.js';
import type { VideoAgentFreshness, VideoAgentScriptChapter, VideoAgentOutline } from './video-agent.types.js';

/** How many of the channel's earlier videos each check looks back over. */
const CONTENT_LOOKBACK = 15;
const STRUCTURE_LOOKBACK = 5;
/** Share of positions where form or opening may match an earlier video before it counts as the same mould. */
const SAME_MOULD_SHARE = 0.6;
/**
 * Title overlap (5-gram containment, %) at or above which two titles count as the same formula.
 * Calibrated on 10 real titles of a channel: titles built on one template overlapped 12-40%, titles
 * on different topics 0-7%. Small sample; adjust if it flags or misses too much.
 */
const TITLE_FORMULA_PERCENT = 15;

/** Titles that promise scientific proof. Unsupported in a channel that cites no study, and risky in health/psychology. */
const UNSUPPORTED_CLAIM = /(脳科学|科学|研究|医学|心理学|統計).{0,3}(が|で|的に)(証明|判明|実証|明らか|明か|解き明か)/;

function bodyOf(chapters: VideoAgentScriptChapter[]): string {
  return chapters.map(chapter => chapter.sentences.join('')).join('');
}

/**
 * Checks this video against the channel's own earlier videos (same wording, same title formula, same
 * chapter mould) and flags unsupported "science proves" claims. The aim is that the channel as a
 * whole does not read as one template with the topic swapped.
 */
export function checkChannelFreshness(params: {
  runId: string;
  channelId: string;
  outline: VideoAgentOutline;
  chapters: VideoAgentScriptChapter[];
}): VideoAgentFreshness {
  const body = bodyOf(params.chapters);
  const issues: VideoAgentFreshness['issues'] = [];

  const earlier = videoAgentRepository
    .findAll()
    .filter(run => run.id !== params.runId && run.input.channelId === params.channelId && run.script)
    .slice(0, CONTENT_LOOKBACK);

  for (const run of earlier) {
    const label = run.title ?? run.id.slice(0, 8);
    const script = run.script!;
    const gram8 = ngramContainment(body, bodyOf(script.chapters), 8);
    const gram15 = ngramContainment(body, bodyOf(script.chapters), 15);
    if (gram8 > SIMILARITY_LIMITS.gram8 || gram15 > SIMILARITY_LIMITS.gram15) {
      issues.push({
        kind: 'content',
        message: `Lời văn trùng video cũ của kênh "${label}" (8-gram ${gram8}%, 15-gram ${gram15}%). Viết lại phần trùng, đừng dùng lại câu hay ví dụ đã đăng.`,
      });
    }
  }

  for (const run of earlier) {
    const previousTitle = run.script!.outline.title;
    const overlap = ngramContainment(params.outline.title, previousTitle, 5);
    if (overlap >= TITLE_FORMULA_PERCENT) {
      issues.push({
        kind: 'title',
        message: `Tiêu đề dùng cùng công thức với "${previousTitle}" (${overlap}% trùng). Đổi cấu trúc câu, không chỉ đổi chủ đề.`,
      });
    }
  }

  // Chapter forms exist only on agent plans; manual projects store a plain outline, so there is nothing to compare.
  const planned = Boolean(params.outline.spine?.centralQuestion);
  for (const run of planned ? earlier.slice(0, STRUCTURE_LOOKBACK) : []) {
    const previous = run.script!.outline.chapters;
    if (previous.length === 0 || !previous[0]?.form || !run.script!.outline.spine?.centralQuestion) continue; // saved before chapter forms existed, or a manual project
    const positions = Math.min(previous.length, params.outline.chapters.length);
    let sameForm = 0;
    let sameOpening = 0;
    for (let index = 0; index < positions; index++) {
      if (previous[index]?.form === params.outline.chapters[index]?.form) sameForm++;
      if (previous[index]?.openingType === params.outline.chapters[index]?.openingType) sameOpening++;
    }
    const label = run.script!.outline.title;
    if (sameForm / positions >= SAME_MOULD_SHARE) {
      issues.push({
        kind: 'structure',
        message: `${sameForm}/${positions} chương cùng hình thức với video "${label}". Đổi thứ tự hoặc dùng hình thức khác.`,
      });
    }
    if (sameOpening / positions >= SAME_MOULD_SHARE) {
      issues.push({
        kind: 'structure',
        message: `${sameOpening}/${positions} chương cùng kiểu mở với video "${label}". Đổi cách mở.`,
      });
    }
  }

  if (UNSUPPORTED_CLAIM.test(params.outline.title)) {
    issues.push({
      kind: 'claim',
      message:
        'Tiêu đề khẳng định "khoa học/nghiên cứu đã chứng minh". Kịch bản không dẫn nguồn nghiên cứu nào, nên đổi sang cách nói không hứa chứng minh (ví dụ nêu quan sát hay câu hỏi).',
    });
  }

  return { compared: earlier.length, issues, pass: issues.length === 0 };
}
