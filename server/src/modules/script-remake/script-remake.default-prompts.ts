import { AppError } from '../../shared/http/errors.js';
import { getPromptTemplateArity, readPromptSource } from '../prompts/prompts.file-store.js';
import { promptsRepository } from '../prompts/prompts.repository.js';
import { promptsService } from '../prompts/prompts.service.js';
import type { PromptLanguage } from '../prompts/prompts.types.js';

export const DEFAULT_REMAKE_BASE_KEY = 'remake_script';

/**
 * Step 1 plans a new video from the source transcript; step 2 is sent once per chapter in the
 * same chat, so the LLM sees every chapter it already wrote and can avoid repeating itself.
 * Both are plain prompt templates: edit them on the Prompts page like any other prompt.
 */
const STEP_1 = [
  'export default (transcript, notes, minMinutes, maxMinutes) => `You are the planner for a Japanese YouTube channel about psychology and brain science. The audience is mainly Japanese viewers aged 50-70. Write the Japanese fields of your output (title, angle, hook, headings, key points) in natural Japanese.',
  '',
  'Below is the transcript of a reference video that is trending now. Use it to plan a NEW video on the same theme.',
  '',
  'Rules:',
  '- Do not reuse the sentences, concrete examples or order of points of the reference video. Borrow only the theme and what viewers care about.',
  '- Include at least one new angle that the reference video does not have.',
  '- The title must use different words from the reference title.',
  '- Give every chapter at least one concrete everyday scene as an example.',
  '- Do not invent studies, universities or statistics. No medical claims.',
  '',
  'Length - you choose the runtime, between ${minMinutes} and ${maxMinutes} minutes (about 330 characters of narration per minute), from the material and not from the length of the reference video:',
  '- Count the distinct points that can each carry a chapter of their own (its own scene, conflict and takeaway). A chapter holds about 1.5-4.5 minutes, so the runtime is roughly chapters x 2-3 minutes (30 minutes needs at least 7 chapters; 12 minutes at most 8).',
  '- A thin topic with one idea and a few examples fits the short end. A rich topic with many distinct points fits 20-30 minutes.',
  '- Never stretch to reach a number. If you would have to repeat a point, restate an example or add generic advice to fill the time, shorten the video.',
  '- The minimum is ${minMinutes} minutes. If the topic cannot honestly fill it, pick a stronger angle with more material instead of padding.',
  '',
  '${notes ? "Producer notes: " + notes : ""}',
  '',
  'Output exactly one JSON code block and nothing else. Format:',
  '{"title": "...", "angle": "...", "hook": "...", "targetMinutes": 15, "lengthReason": "...", "chapters": [{"heading": "...", "keyPoints": ["...", "..."]}]}',
  '- title: the video title.',
  '- angle: the new angle, in one sentence.',
  '- hook: what the first 30 seconds say.',
  '- targetMinutes: an integer from ${minMinutes} to ${maxMinutes}.',
  '- lengthReason: in Vietnamese, why this length (how many distinct chapters, what the transcript covers and what you add).',
  '',
  'Reference video transcript:',
  '${transcript}`;',
].join('\n');

/** The first default (length picked by the user). Used only to recognise an unedited copy and upgrade it. */
const LEGACY_STEP_1 = [
  'export default (transcript, targetChars, notes) => `あなたは日本のYouTube「心理学・脳科学」チャンネルの構成作家です。視聴者は主に50〜70代の日本人です。',
  '',
  '以下は今伸びている参考動画の文字起こしです。これを参考に、同じテーマで「新しい動画」を企画してください。',
  '',
  'ルール:',
  '- 参考動画の文章・具体例・章の順番をそのまま使わない。借りるのはテーマと視聴者の関心だけ。',
  '- 参考動画にない新しい切り口を必ず1つ入れる。',
  '- タイトルは参考動画のタイトルと違う言葉にする。',
  '- 章は5〜8個。各章に日常の具体的な場面の例を1つ以上入れる。',
  '- 実在しない研究・大学・統計を作らない。医療的な断定はしない。',
  '',
  '台本全体の目安: 約${targetChars}字。',
  '${notes ? "制作メモ: " + notes : ""}',
  '',
  '出力はJSONのコードブロック1つだけ。説明文は不要。形式:',
  '{"title": "動画タイトル", "angle": "参考動画にない切り口を1文で", "hook": "最初の30秒で何を言うか", "chapters": [{"heading": "章見出し", "keyPoints": ["この章で扱うこと", "具体例"]}]}',
  '',
  '参考動画の文字起こし:',
  '${transcript}`;',
].join('\n');

const STEP_2 = [
  'export default (chapterNumber, totalChapters, heading, keyPoints, chapterChars) => `では、上の企画の第${chapterNumber}章（全${totalChapters}章）「${heading}」のナレーション本文を書いてください。',
  '',
  'この章で必ず扱うこと:',
  '${keyPoints.map((point) => "- " + point).join("\\n")}',
  '',
  'ルール:',
  '- 約${chapterChars}字（±15%）。',
  '- です・ます調。視聴者に「あなた」と語りかける。1文は40字前後まで。',
  '- 音声合成で読み上げるので、記号・英字略語・絵文字・括弧書きは使わない。英単語はカタカナで。数字は読みやすく書く。',
  '- これまでの章で使った例や主張を繰り返さない。前の章から自然につなげる。',
  '- 参考動画の文章や例をそのまま使わない。',
  '${chapterNumber === 1 ? "- 最初の2〜3文で視聴者の悩みや場面に触れ、30秒以内にこの動画でわかることを約束する。章見出しは読み上げない。" : ""}',
  '${chapterNumber === totalChapters ? "- 最後の章なので全体を短くまとめ、安心感のある言葉で締め、コメントで体験を教えてほしいと一言添える。" : ""}',
  '',
  '出力はテキストのコードブロック1つだけ。1行に1文。説明文は不要。`;',
].join('\n');

function normalizeTemplate(source: string): string {
  return source.trim().replace(/^export\s+default\s+/, '').replace(/;+\s*$/, '');
}

/**
 * Step 1 used to take (transcript, targetChars, notes) with the length picked by the user. It now
 * takes (transcript, notes, minMinutes, maxMinutes) and the planner picks the length. A stored copy
 * that is still the old default is upgraded in place; a copy someone has edited is left alone and
 * the remake refuses to run with it (see `assertStep1Current`).
 */
async function upgradeLegacyStep1(): Promise<void> {
  const key = `${DEFAULT_REMAKE_BASE_KEY}_step_1`;
  const prompt = promptsRepository.findByKeyAndLanguage(key, 'ja');
  if (!prompt) return;
  const source = await readPromptSource('ja', key).catch(() => '');
  if (normalizeTemplate(source) === normalizeTemplate(LEGACY_STEP_1)) {
    await promptsService.update(prompt.id, { template: STEP_1 });
  }
}

/** Throws if the stored step-1 prompt still expects the user-chosen length. */
export async function assertRemakeStep1Current(language: PromptLanguage, key: string): Promise<void> {
  const arity = await getPromptTemplateArity(language, key);
  if (arity < 4) {
    throw new AppError(
      'Prompt bước 1 của Remake đang dùng định dạng cũ (độ dài do người dùng chọn). Vào trang Prompt, mở "Remake kịch bản" bước 1 và đổi tham số thành (transcript, notes, minMinutes, maxMinutes), hoặc xoá bộ prompt này để tạo lại bản mặc định.',
      409,
      'REMAKE_PROMPT_OUTDATED',
    );
  }
}

/** Creates the default Japanese remake prompt set the first time it is needed. */
export async function ensureDefaultRemakePrompts(): Promise<void> {
  const exists = promptsRepository
    .findAllSets()
    .some(set => set.category === 'remake' && set.baseKey === DEFAULT_REMAKE_BASE_KEY && set.language === 'ja');
  if (exists) {
    await upgradeLegacyStep1();
    return;
  }

  const common = {
    language: 'ja' as const,
    name: 'Remake kịch bản (dàn ý → từng chương)',
    category: 'remake' as const,
    outputType: 'text' as const,
  };
  await promptsService.create({
    ...common,
    key: `${DEFAULT_REMAKE_BASE_KEY}_step_1`,
    template: STEP_1,
    description: 'Đọc transcript nguồn, lập dàn ý video mới (JSON).',
  });
  await promptsService.create({
    ...common,
    key: `${DEFAULT_REMAKE_BASE_KEY}_step_2`,
    template: STEP_2,
    description: 'Gửi một lần cho mỗi chương, trong cùng cuộc chat.',
  });
}
