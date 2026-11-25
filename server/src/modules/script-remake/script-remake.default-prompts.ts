import { AppError } from '../../shared/http/errors.js';
import { getPromptTemplateArity, readPromptSource } from '../prompts/prompts.file-store.js';
import { promptsRepository } from '../prompts/prompts.repository.js';
import { promptsService } from '../prompts/prompts.service.js';
import type { PromptLanguage } from '../prompts/prompts.types.js';
import { PREVIOUS_STEP_1_DEFAULTS, PREVIOUS_STEP_2_DEFAULTS } from './script-remake.legacy-prompts.js';

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
  'Originality:',
  '- Do not reuse the sentences, concrete examples or order of points of the reference video. Borrow only the theme and what viewers care about.',
  '- Include at least one new angle that the reference video does not have.',
  '- The title must use different words from the reference title.',
  '',
  'No repetition between chapters (the most common failure):',
  '- Every chapter has its own takeaway, and no two chapters may lead to the same conclusion. Two studies that prove the same point (for example "people like you more than you think" and "people notice your mistakes less than you think") belong in ONE chapter.',
  '- The first keyPoint of each chapter is its takeaway in one sentence. Compare the takeaways: if two say the same thing in other words, merge those chapters.',
  '- Two chapters may not teach the same technique either. "Add a little about yourself after a question" and "keep your own story short and hand the turn back" are ONE technique: one chapter.',
  '- The core message of the video is stated in the hook and in the last chapter, not repeated in every chapter.',
  '',
  'Practical value:',
  '- If the title promises a skill or a method, at least half of the chapters each teach one concrete technique the viewer can try tomorrow, with a ready-to-say example phrase in the keyPoints.',
  '- Cover the questions viewers will have that the reference video skips (for a conversation topic, for example: how to start, what to do when it goes silent, how to end politely, what to avoid).',
  '- The last chapter adds something new, such as three small habits to start tomorrow, not only a summary.',
  '',
  'Concrete, not generic:',
  '- Give every chapter at least one concrete everyday scene. Vary the settings across the video and match the age in the title: if the title says 50代, include scenes of people who still work (workplace, younger colleagues, class reunions, husband and wife, the years before retirement), not only walks, hobbies and hospitals.',
  '- Give the video one through-line story about a named person (for example 60歳の佐藤さん): the problem in the first chapter, what they try in the middle chapters, and what changed in the last chapter. Describe it in "story" and put the matching beat into the keyPoints of those chapters. Never drop the person after one chapter.',
  '- Example phrases use real-sounding names (田中さん), never placeholders like 〇〇さん or ××.',
  '- When a chapter uses a study, put it in the keyPoints with researcher, institution, year, setup and key result, for example "Gilovich et al., Cornell, 2000: one student at a time entered a room wearing an embarrassing T-shirt; they guessed about half the room noticed, only about a quarter did". Use only well-known studies you are sure of, with the right method name (a speed-dating study is スピードデート, not お見合い). State only what the study found: no "劇的に", no "regardless of X" unless the study says so, and never present your own example phrases as something the researchers reported. Never invent studies, universities or numbers; if you are unsure of the details, use an everyday example instead of a vague "ある大学の実験". No medical claims.',
  '- Every conclusion in the last chapter must have been shown earlier in the video. Do not close with a claim no chapter supported.',
  '',
  'Structure:',
  '- Order the chapters so the video flows: the problem and why it happens first, then the techniques in a logical order, then the closing. Do not wedge a mindset chapter between technique chapters without a reason.',
  '- Each heading must match what its chapter says. Never name the thing a chapter warns against as if it were the method (for example, do not call the recommended way 一問一答).',
  '- Each chapter ends by pointing to the NEXT chapter in the list. Order the chapters so that every hand-over is true: if chapter 2 raises a question, chapter 3 answers it.',
  '- The hook opens with a concrete scene the viewer recognises, then promises what the video gives them.',
  '',
  'Length - you choose the runtime, between ${minMinutes} and ${maxMinutes} minutes (about 300 characters of narration per minute), from the material and not from the length of the reference video:',
  '- Count the distinct points that can each carry a chapter of their own (its own scene, conflict and takeaway). A chapter holds about 1.5-4.5 minutes, so the runtime is roughly chapters x 2-3 minutes (30 minutes needs at least 7 chapters; 12 minutes at most 8).',
  '- A thin topic with one idea and a few examples fits the short end. A rich topic with many distinct points fits 20-30 minutes.',
  '- Never stretch to reach a number. If you would have to repeat a point, restate an example or add generic advice to fill the time, shorten the video.',
  '- The minimum is ${minMinutes} minutes. If the topic cannot honestly fill it, pick a stronger angle with more material instead of padding.',
  '',
  '${notes ? "Producer notes: " + notes : ""}',
  '',
  'Before you output, check the plan: no two takeaways or techniques overlap, the story runs from the first chapter to the last, every hand-over leads into the next chapter, and every heading matches its chapter. Fix the plan if any check fails.',
  '',
  'Output exactly one JSON code block and nothing else. Format:',
  '{"title": "...", "angle": "...", "hook": "...", "story": "...", "targetMinutes": 15, "lengthReason": "...", "chapters": [{"heading": "...", "keyPoints": ["...", "..."]}]}',
  '- title: the video title.',
  '- angle: the new angle, in one sentence.',
  '- hook: what the first 30 seconds say: the scene, then what the viewer will get from the video.',
  '- story: in Japanese, the named person and how their story moves from the first chapter to the last.',
  '- targetMinutes: an integer from ${minMinutes} to ${maxMinutes}.',
  '- lengthReason: in Vietnamese, why this length (how many distinct chapters, what the transcript covers and what you add).',
  '- chapters[].keyPoints: the takeaway first, then the scene or story, then the technique with its example phrase and/or the study with its details.',
  '',
  'Reference video transcript:',
  '${transcript}`;',
].join('\n');

const STEP_2 = [
  'export default (chapterNumber, totalChapters, heading, keyPoints, chapterChars, context = {}) => `では、上の企画の第${chapterNumber}章（全${totalChapters}章）「${heading}」のナレーション本文を書いてください。',
  '',
  'この章で必ず扱うこと:',
  '${keyPoints.map((point) => "- " + point).join("\\n")}',
  '${context.story ? "\\n動画全体を通す人物の物語（この章の分を自然に入れる。名前と設定は変えない）:\\n" + context.story + "\\n" : ""}',
  '${chapterNumber === 1 && context.hook ? "\\n冒頭30秒で伝えること:\\n" + context.hook + "\\n" : ""}',
  '${context.nextHeading ? "\\n次の章（第" + (chapterNumber + 1) + "章）は「" + context.nextHeading + "」。扱う内容: " + (context.nextKeyPoints || []).join(" / ") + "\\n" : ""}',
  '',
  '分量と文体:',
  '- 約${chapterChars}字（±15%）。',
  '- です・ます調。視聴者に「あなた」と語りかける。1文は40字前後まで。',
  '- 音声合成で読み上げるので、記号・英字略語・絵文字・括弧書きは使わない。英単語や人名はカタカナで。数字は読みやすく書く。セリフの例は「」で囲んでよい。',
  '- 自然で正しい日本語にする。助詞の抜けや「もったいありません」のような誤用をしない。',
  '- 〇〇さん・××のような伏せ字は使わない。例の人物には田中さんのような名前をつける。',
  '- 年は「二〇〇〇年」のように書き、聞いて誤解されない形にする。',
  '',
  '繰り返しを避ける（最重要）:',
  '- 書く前に、これまでの章を読み返す。そこで使った例・研究・主張・決め台詞を、言い換えても繰り返さない。',
  '- 前の章の振り返りは最大1文。2章目以降を前の章の要約から始めない。',
  '- 章の書き出しと締めを毎回変える。「それではここから〜見ていきましょう」「次の章では〜お話ししていきましょう」「〜でしたね」のような決まった型を使い回さない。',
  '- 「温かい」「心地よい」「安心感」「ほんの一言」「キャッチボール」のような雰囲気の言葉は、1章に各1回まで。形容詞を重ねず、具体的な場面や動作で伝える。',
  '- 文末の「〜ですよ」「〜のですね」は1章に合わせて2回まで。文末に変化をつける。',
  '- 同じセリフの例や同じ文を、この章の中でも2回書かない。',
  '- 「〜ことはありませんか」「〜経験はありませんか」で始めるのは動画全体で2章まで。問いかけ、場面、事実、人物のセリフなど、章ごとに入り方を変える。',
  '',
  '参考動画と違う言葉で書く（重要）:',
  '- 参考動画の文字起こしはこのチャットの最初にある。その文・言い回し・セリフの例を使わない。言い換えるときも語順と言葉を変える。',
  '- 参考動画と同じ研究を紹介してよいが、実験の説明と結果の伝え方は自分の言葉で組み立て直す。',
  '- 参考動画で使われた具体例や場面（登場する家族・場所・セリフ）は、別の人物・別の場面に置き換える。',
  '',
  '中身:',
  '- 一般論で終わらせず、具体的な場面・人物・セリフで見せる。',
  '- 方法を教える章では、視聴者がそのまま使える言い方を1つ以上示し、使う場面と相手の反応まで描く。',
  '- 研究を紹介するときは「ある大学で」とぼかさない。大学名・研究者名・年・どんな実験か・結果の数字を具体的に話す。確かでない細部は作らない。',
  '- 研究が示したこと以上に言わない。「劇的に」「証明した」のような誇張や、研究にない条件を足さない。研究者が言っていないセリフの例を、研究の結果として話さない。',
  '${chapterNumber === 1 ? "- 最初の2〜3文で視聴者が思い当たる具体的な場面を描き、30秒以内にこの動画でわかることを約束する。章見出しは読み上げない。" : ""}',
  '${chapterNumber < totalChapters ? "- 章の最後の1〜2文は、上に書いた次の章の内容へ自然につなぐ問いや意外な事実にする。次の章で扱わないことを予告しない。決まり文句にしない。" : ""}',
  '${chapterNumber === totalChapters ? "- 最後の章なので、全体の振り返りは2〜3文にとどめ、明日から試せる小さな習慣を具体的に示す。前の章の文を繰り返さない。人物の物語をここで締めくくる。これまでの章で示していない新しい結論は言わない。安心できる言葉で締め、コメントで体験を教えてほしいと一言添え、チャンネル登録をお願いする。" : ""}',
  '',
  '出力はテキストのコードブロック1つだけ。1行に1文。説明文は不要。`;',
].join('\n');




function normalizeTemplate(source: string): string {
  // Files may be checked out with CRLF line endings.
  return source.replace(/\r\n/g, '\n').trim().replace(/^export\s+default\s+/, '').replace(/;+\s*$/, '');
}

/** Every earlier default of each step, oldest first, with the current one. */
const DEFAULT_HISTORY: { step: number; previous: string[]; current: string }[] = [
  // The previous default differed from the current one only in the planning pace (330 → 300 chars/min).
  {
    step: 1,
    previous: [...PREVIOUS_STEP_1_DEFAULTS, STEP_1.replace('(about 300 characters', '(about 330 characters')],
    current: STEP_1,
  },
  { step: 2, previous: PREVIOUS_STEP_2_DEFAULTS, current: STEP_2 },
];

/**
 * A stored step that is still an earlier default is upgraded in place to the current one. A copy
 * someone has edited is left alone (an old-format step 1 then makes the remake refuse to run, see
 * `assertRemakeStep1Current`).
 */
async function upgradeUneditedDefaults(): Promise<void> {
  for (const { step, previous, current } of DEFAULT_HISTORY) {
    const key = `${DEFAULT_REMAKE_BASE_KEY}_step_${step}`;
    const prompt = promptsRepository.findByKeyAndLanguage(key, 'ja');
    if (!prompt) continue;
    const source = normalizeTemplate(await readPromptSource('ja', key).catch(() => ''));
    if (previous.some(template => normalizeTemplate(template) === source)) {
      await promptsService.update(prompt.id, { template: current });
    }
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
    await upgradeUneditedDefaults();
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
