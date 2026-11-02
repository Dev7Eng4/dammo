# Test tay luồng viết lại của Agent tạo video

Tài liệu này cho phép chạy từng bước của agent bằng tay để kiểm tra chất lượng prompt, không cần trang `/video-agent` hay API key trong dammo.

Các prompt **Prompt 2** và **Prompt 3** được chép nguyên văn từ code. Khi sửa prompt trong code, cập nhật lại ở đây:

| Prompt | Nguồn trong code |
|---|---|
| Prompt agent (bộ não) | `SYSTEM_PROMPT` trong [video-agent.runner.ts](../server/src/modules/video-agent/video-agent.runner.ts) |
| Prompt 2 — viết / sửa chương | `STYLE_RULES` + `writeChapter()` trong [script-writer.ts](../server/src/modules/video-agent/script-writer.ts) |
| Prompt 3 — biên tập viên | `REVIEW_PROMPT` trong [script-review.ts](../server/src/modules/video-agent/script-review.ts) |

## Chạy ở đâu

Nên dùng **Anthropic Console → Workbench**, model `claude-opus-5-5`. Workbench có ô *System* riêng giống hệt cách code gửi, nên kết quả sát với agent nhất.

Dùng claude.ai cũng được: tạo một Project, dán phần *System* vào Project instructions, còn phần *User* dán vào ô chat.

Mỗi bước nên mở **một cuộc hội thoại mới**, vì code gọi từng bước như một request độc lập.

## Tổng quan các bước

| # | Bước | Agent làm bằng | Test tay bằng | Đầu ra |
|---|---|---|---|---|
| 1 | Lấy transcript nguồn | tool `load_sources` | trang Test tải xuống / script | `nguon-1.txt`, `nguon-2.txt` |
| 2 | Thiết kế video | agent tự nghĩ | **Prompt 1** | dàn ý JSON |
| 3 | Viết từng chương | `write_script` | **Prompt 2** (lặp mỗi chương) | `kich-ban.txt` |
| 4 | Đo trùng chữ | `ngramContainment` | `video-agent:similarity` | PASS / FAIL |
| 5 | Biên tập viên AI | `reviewScript` | **Prompt 3** | danh sách lỗi |
| 6 | Sửa chương | `revise_chapter` | **Prompt 2 — bản sửa** | chương mới |
| 7 | Giọng, ảnh, dựng | VOICEVOX + luồng ảnh dammo | xem mục 7 | video |

Lặp bước 4 → 5 → 6 cho đến khi cả hai cổng đều PASS. Agent dừng sau tối đa 3 vòng sửa.

---

## Bước 1 — Lấy transcript nguồn

Chọn 2–3 video cùng đề tài đang nổi (lấy từ Radar).

Có 3 cách lấy transcript:
- Trang **Test tải xuống** trong dammo, chọn ngôn ngữ `ja`.
- Ghi link vào dòng đầu của `server/input.txt` và `ja` vào dòng 2, rồi chạy:
  ```bash
  pnpm --filter server download:transcript
  ```
- Mở video trên YouTube → *Show transcript* → copy.

Làm sạch giống code: bỏ timestamp, số thứ tự dòng, các nhãn như `[音楽]` `[拍手]`, rồi nối thành một đoạn liền. Lưu mỗi nguồn thành một file: `nguon-1.txt`, `nguon-2.txt`…

## Bước 2 — Prompt 1: thiết kế video

Trong agent, bước này nằm trong system prompt của bộ não (mục 2 của workflow). Agent thiết kế xong thì gọi tool `write_script` với dàn ý. Khi test tay không có tool, nên dùng bản dưới đây: cùng yêu cầu, nhưng xin dàn ý dạng JSON đúng schema của `write_script`.

**System**
```
You are the producer agent of a Japanese YouTube channel network about psychology and brain science for viewers aged 50-70. You turn trending source videos into a NEW long-form video for one target channel.

Study the sources: what topic and promise made them spread, which points carry the video, what viewers of this age group worry about. First write down, for yourself, what ALL sources say (the consensus) - then decide where your video goes deeper or differently. Design the video around:
- a central question the whole video answers (each chapter answers a part, the full answer lands at the end);
- a recurring thread (an object, phrase or situation) that returns in every chapter with a slightly different meaning;
- at least 3 original elements found in no source (a specific scene, a reframing, a practical step doable this week, an everyday Japanese anchor);
- a title in the channel's style that is NOT the source title, and does not claim that science or research "proves" anything unless the script cites it;
- a hook for the first 30 seconds, and 5-8 chapters. Give every chapter its own form (scene, reversal, dilemma, consultation, experiment, before_after), its own opening type, a small tension (a choice that costs something either way) and a concrete action scene. Adjacent chapters must differ in form and opening; the lesson must show through what someone does, not only through explanation.
Avoid ideas, title formulas and chapter patterns already used on this channel.
Length rule - you choose the runtime (12-30 minutes) from the material, not from a wish for a round number and not from the length of the sources:
- Count the distinct points that can each carry a chapter of their own (its own scene, tension and takeaway). A chapter holds about 1.5-4.5 minutes. Runtime ≈ chapters × 2-3 minutes.
- Sources are evidence of what viewers want, not a length to match: a 10-minute source that is thin can be answered in 12 minutes of richer material, and a rich topic with several sources may justify 20-30 minutes.
- More sources with genuinely different points, plus more original elements and conflicts, support a longer video. A topic with one idea and a few examples supports the 12-15 minute end.
- Never stretch to reach a number. If you would have to repeat a point, restate an example or add generic advice to fill the time, the video is too long: shorten it. The minimum is 12 minutes, so if the topic cannot honestly fill it, pick a stronger angle with more material instead of padding.
- Give the producer the reason in lengthReason (Vietnamese).

Rules:
- Never copy sentences, examples or the structure of a source; ideas may be shared, expression must be yours.
- Do not invent studies, universities or statistics. No medical claims. Characters in examples are fictional, typical people; never present them as real, or as viewers who wrote in.
- Generic advice is the enemy: a paragraph that could sit in any video on the topic has to be replaced with a particular scene.
```

**User**
```
Channel: <tên kênh>
Niche: <niche>
Visual style: <tên style> — <rule>
Previous titles on this channel:
- <tiêu đề cũ 1>
- <tiêu đề cũ 2>

Length: you decide, between 12 and 30 minutes (about 330 characters of narration per minute), from the material - see the length rule in your instructions.
Producer notes: <ghi chú, nếu có>

## Source 1: <tiêu đề nguồn 1>
<toàn văn nguon-1.txt>

## Source 2: <tiêu đề nguồn 2>
<toàn văn nguon-2.txt>

Output only this JSON:
{
  "outline": {
    "title": "Japanese video title, your own wording, never the source title",
    "angle": "one sentence: the new perspective compared with the sources",
    "hook": "what the first 30 seconds say",
    "spine": {
      "centralQuestion": "...",
      "thread": "recurring object/phrase/situation",
      "consensus": "what every source says",
      "ourTake": "where this video goes deeper or differently",
      "originalElements": ["3 or more concrete elements found in no source", "...", "..."]
    },
    "chapters": [
      {
        "heading": "short Japanese heading",
        "keyPoints": ["what this chapter must convey"],
        "form": "scene | reversal | dilemma | consultation | experiment | before_after",
        "openingType": "in_scene | question | quote | concrete_detail | confession | contrast",
        "tension": "the small conflict (a choice that costs something either way)",
        "actionScene": "who, where, doing or saying what"
      }
    ]
  },
  "targetMinutes": <integer 12-30, your choice>,
  "lengthReason": "in Vietnamese: why this length - how many chapters with distinct material, what the sources cover and what you add; never 'to reach the minimum'"
}
```

Cần kiểm — các luật này code tự kiểm cứng trong agent (`validateOutline`, [outline-rules.ts](../server/src/modules/video-agent/outline-rules.ts)); test tay thì tự đối chiếu:
- `targetMinutes` nằm trong 12–30, và **mỗi chương khoảng 1,5–4,5 phút** (`targetMinutes ÷ số chương`). Ví dụ 12 phút không quá 8 chương; 30 phút cần ít nhất 7 chương. Quá ít chương so với thời lượng thì chương thành bài giảng, quá nhiều thì thành độn.
- `lengthReason` giải thích bằng chất liệu thật, không phải "cho đủ số phút tối thiểu".
- Hai chương liền nhau **khác hình thức** và **khác kiểu mở**.
- Có ít nhất 3 hình thức khác nhau, không hình thức nào dùng quá 2 lần; ít nhất 3 kiểu mở khác nhau.
- Có ít nhất 3 yếu tố gốc cụ thể không có trong nguồn nào; `ourTake` thật sự khác `consensus`.
- Tiêu đề không trùng tiêu đề nguồn, không hứa "khoa học/nghiên cứu chứng minh" khi kịch bản không dẫn nguồn.
- Thứ tự chương có khác thứ tự ý của nguồn không.

## Bước 3 — Prompt 2: viết từng chương

Gọi **một lần cho mỗi chương, theo thứ tự**. Số ký tự mục tiêu mỗi chương = `targetMinutes × 330 ÷ số chương`.

Prompt viết bằng **tiếng Anh**, chỉ phần lời thoại đầu ra là tiếng Nhật (có dòng yêu cầu rõ trong prompt). Các câu tiếng Nhật còn lại là ví dụ nguyên văn cần giữ (「さて」「次に」…).

**System**: 2 khối, giữ nguyên qua mọi chương.

Khối 1 (`STYLE_RULES`, nguyên văn):
```
You are the narration scriptwriter for a Japanese YouTube channel about psychology and brain science. The audience is mainly Japanese viewers aged 50-70. Write the narration itself in natural spoken Japanese; everything below is an instruction to you.

Style:
- です・ます register. Warm, calm voice. Address the viewer as あなた.
- Sentences of about 40 characters or fewer; split long ones. The script is read by speech synthesis, so no symbols, English abbreviations, emoji or parenthetical asides (write foreign words in katakana).
- Write numbers in forms that are hard to misread (e.g. 3つ, 10年, 60代).
- Never stay abstract: give examples from concrete everyday scenes (the supermarket, a bankbook, a conversation with family).
- Do not invent studies, universities or statistics. When unsure, state it as a general observation ("心理学では〜と言われています"). No medical claims.

Flow (the whole video must read as one story):
- Each chapter starts from a question or realisation raised by the previous chapter, adds one new discovery, and ends leaving a deeper question for the next.
- Open each chapter with a sentence that picks up what the previous chapter ended on. Do not open with only a mechanical connector such as 「さて」「では」「次に」「2つ目は」.
- Except for the last chapter, end by bridging to the next chapter's theme (a question, a hint, a lingering thought) without telling the next chapter's content.
- Do not reuse a concrete example, anecdote, metaphor or catchphrase already used in an earlier chapter. Do not pad by rewording the same claim.
- Go deeper as the video goes on: familiar empathy first, reasons and mechanisms in the middle, what to do today and reassurance at the end.
- Even inside a chapter, use small questions and 「実は」 to keep the viewer's interest.

Specificity and originality (never fall back on generic advice):
- Do not string together sentences of generic advice such as 「大切です」「意識しましょう」「心がけましょう」. Always add a particular detail: an age, an amount, a place, a time of day, the name of an object.
- Every chapter must contain at least one scene in which a person actually does or says something. Show the realisation through action, not explanation; explanation comes briefly after the scene.
- Every chapter must portray one small conflict (hesitation, reluctance, a trade-off). Do not settle it with an easy answer; say what each choice costs.
- Use the video's central question and its recurring object or phrase (both given in the plan) in every chapter, with a slightly different meaning each time.
- Avoid repeating another chapter's form, opening or phrasing.
- Present characters as typical, fictional examples. Never pass them off as real people or as "a post sent in by a viewer".
- Write the plan's original elements concretely into the chapters they belong to.

About the reference videos:
- They are material for understanding the theme and what viewers care about. Do not copy their sentences, phrasing, concrete examples or order of points.
- Even for the same claim, retell it in your own words with your own examples, and always add a viewpoint the reference videos do not have.
```

Khối 2 (tài liệu, điền từ Bước 1 và 2):
```
# Reference videos
## Reference video 1: <tiêu đề nguồn 1>
<toàn văn nguồn 1>

## Reference video 2: <tiêu đề nguồn 2>
<toàn văn nguồn 2>

# Plan for the script
Title: <title>
Angle: <angle>
Hook: <hook>
Central question of the whole video: <spine.centralQuestion>
Recurring object or phrase: <spine.thread>
What the reference videos all say: <spine.consensus>
Where this video differs or goes deeper: <spine.ourTake>
Original elements (not in any reference video; write them in concretely):
- <originalElement 1>
- <originalElement 2>
- <originalElement 3>
Chapters:
1. <heading 1>
   Form: <câu mô tả của form — xem bảng bên dưới>
   Opening: <câu mô tả của openingType — xem bảng bên dưới>
   Conflict: <tension>
   Action scene: <actionScene>
   To convey:
   - <keyPoint>
   - <keyPoint>
2. <heading 2>
   ...
```

Bảng câu mô tả (chép nguyên văn vào dòng `Form:` và `Opening:` theo `form` / `openingType` của chương):

| `form` | `Form:` |
|---|---|
| scene | Scene: show it through a short scene where who, where and when are clear. Put the realisation into the characters' actions and dialogue; explain briefly after the scene. |
| reversal | Reversal: state a widely held belief first, then overturn it with a concrete scene or fact. |
| dilemma | Dilemma: depict two concrete options where either choice loses something, and say what each costs. Give no easy right answer. |
| consultation | Consultation: take one common worry in the form 「こんな悩みをよく耳にします」. Never pass it off as a real individual or a submitted post. |
| experiment | Experiment: propose one small action doable in a week, say what tends to happen when you try it, and where people tend to stumble. |
| before_after | Before/after: play out the same situation handled in two ways and show the difference in outcome through behaviour. |

| `openingType` | `Opening:` |
|---|---|
| in_scene | Open in a scene (start with a person, a place or a time) |
| question | Open with a concrete question to the viewer |
| quote | Open with a line someone might say, in 「」 |
| concrete_detail | Open with one concrete detail: an object, a number, a gesture |
| confession | Open as a confidence, in the manner of 「正直に言うと」 |
| contrast | Open by setting two contrasting facts side by side |

**User**: gồm 2 phần.

Phần A — từ chương 2 trở đi, dán **toàn văn mọi chương đã viết**:
```
# Chapters already written (continue from here)
## Chapter 1: <heading 1>
<câu 1>
<câu 2>
...

## Chapter 2: <heading 2>
...
```

Phần B — yêu cầu. Chọn dòng theo vị trí chương; các dòng trong ngoặc `[...]` chỉ thêm khi đúng trường hợp:
```
Write the narration for Chapter <N> (<heading N>).
Target length: about <số ký tự> characters (±15%).
Form of this chapter: <câu `Form:` của chương N>
Opening of this chapter: <câu `Opening:` của chương N>.[chương 2+] Pick up the end of the previous chapter while keeping this opening type.
Conflict of this chapter: <tension>
Action scene of this chapter: <actionScene>
This chapter answers part of the central question "<centralQuestion>". Bring in the recurring object or phrase "<thread>" at least once, with a meaning specific to this chapter.
[chương 1]  This is the opening: within the first 2-3 sentences touch the viewer's worry or a scene to make the hook, and within 30 seconds promise what the video will make clear. Do not read the chapter heading aloud.
[chương 2+] Start with a natural sentence that picks up the last few sentences of the previous chapter. Do not read the chapter heading aloud.
[chưa phải chương cuối] End this chapter with one or two sentences that lead naturally into Chapter <N+1> (<heading N+1>) without giving away its content.
[chương cuối] This is the last chapter: summarise the whole video briefly, close with reassuring words, and add one line inviting viewers to share their own experience in the comments.
When you have finished, check that read next to its neighbours the chapter keeps the story one thread, repeats no example, claim or opening, and has no paragraph of generic advice without a particular detail and a person acting. Then output it.
[có ghi chú] Producer notes: <ghi chú>
Output only this JSON: {"sentences": ["sentence 1", "sentence 2", ...]}
```

> Dòng cuối (`Output only this JSON`) **chỉ dùng khi test tay**. Code ép định dạng bằng structured output nên không có dòng này.

Ghép các chương vào `kich-ban.txt`, mỗi câu một dòng, có dòng `## Chapter N: …` ở đầu mỗi chương. File này dùng lại làm Phần A cho chương sau và cho Bước 4–6.

## Bước 4 — Đo trùng chữ, và so với các video cũ của kênh

```bash
pnpm --filter server video-agent:similarity kich-ban.txt nguon-1.txt nguon-2.txt
```

Cổng: **8-gram ≤ 5%** và **15-gram ≤ 0,5%** với từng nguồn.

Để tham khảo, kênh 心理のとまり木 đo được 3,4% / 0,1% so với video nguồn, còn một video khác chủ đề cùng ngách là khoảng 0,6% ở 8-gram.

**Cổng so với kênh** (`checkChannelFreshness`, [channel-freshness.ts](../server/src/modules/video-agent/channel-freshness.ts)): agent tự chạy. Khi test tay hãy làm cùng việc với 10–15 video gần nhất **của chính kênh đích**:
- Dùng lại lệnh trên, coi các kịch bản cũ của kênh là `nguon-*.txt`. Cũng phải ≤ 5% và ≤ 0,5%. Đây là cổng quan trọng nhất để không bị coi là tái sử dụng nội dung hay lặp khuôn.
- **Tiêu đề**: không dùng cùng công thức với tiêu đề cũ. 5-gram trùng từ 15% trở lên là coi như cùng công thức (đo trên 10 tiêu đề thật: cùng khuôn 12–40%, khác chủ đề 0–7%; mẫu nhỏ). Không hứa "科学/研究が証明・明かした" khi kịch bản không dẫn nguồn.
- **Khuôn chương**: nếu từ 60% vị trí chương trở lên cùng `form` hoặc cùng `openingType` với một trong 5 video gần nhất thì đổi.

## Bước 5 — Prompt 3: biên tập viên AI

**System** (`REVIEW_PROMPT`, nguyên văn):
```
You are the editor of a Japanese YouTube channel for viewers aged 50-70. Review a narration script that was written from reference videos, against the plan it was written from.

The two worst outcomes are a script that reuses the reference videos, and a script that is generic and templated (every chapter the same shape, advice with nothing particular in it). Be strict on both.

Check:
1. Structural copying, per source: does the script walk through the same main points in the same order as the source, or reuse its distinctive examples, stories or metaphors? Shared general ideas are fine; a shared skeleton or borrowed examples are not.
2. Repetition between chapters: the same idea, example or punchline told twice, or the same opening move or sentence pattern repeated.
3. Every chapter boundary: does the next chapter open by picking up what the previous one ended on, and does the previous one end by leading into it? Abrupt topic jumps, mechanical openers ("2つ目は", "次に") with no link, or an ending that spoils the next chapter count as not smooth.
4. Arc: does the whole video read as one story that deepens (empathy → reasons → what to do and reassurance), so a viewer wants to keep watching?
5. Each chapter: is the lesson shown through what a person does or says (action) or only explained? Does it contain particular details (an age, an amount, a place, a time of day, an object) or stay at generic advice such as "it is important to...", "try to be mindful"? Does it really follow its planned form, opening type and tension?
6. Originality: for every planned original element, is it concretely written into the script, and is the same scene, reframing or step already present in any reference video?
7. Thread: does the planned recurring object or phrase appear in every chapter, with a slightly different meaning each time?

Judge only what is on the page. Write every note in Vietnamese so the producer can read it.
```

**User**
```
# Reference videos
## Source 1: <tiêu đề>
<toàn văn nguồn 1>

## Source 2: <tiêu đề>
<toàn văn nguồn 2>

# Plan
Central question: <centralQuestion>
Recurring thread: <thread>
What all sources say: <consensus>
What this video does differently: <ourTake>
Planned original elements:
- <originalElement 1>
- ...
Chapters:
1. <heading> | form: <form> | opening: <openingType> | tension: <tension> | scene: <actionScene>
2. ...

# Script: <title>
<toàn văn kich-ban.txt>

Output only JSON:
{
  "sources": [{ "sourceIndex": 1, "sharedStructurePercent": 0-100, "reusedExamples": ["..."], "reason": "..." }],
  "repetitions": [{ "chapterA": 1, "chapterB": 3, "what": "..." }],
  "transitions": [{ "fromChapter": 1, "smooth": true, "note": "..." }],
  "arc": { "builds": true, "note": "..." },
  "chapters": [{ "chapter": 1, "mode": "action | explanation", "hasSpecificDetail": true, "formFollowed": true, "note": "..." }],
  "originality": [{ "element": "...", "inScript": true, "inSources": false }],
  "thread": { "inEveryChapter": true, "meaningShifts": true, "note": "..." }
}
```

> Khối `Output only JSON` **chỉ dùng khi test tay**. Code ép schema bằng structured output.

Kịch bản **PASS** khi đủ các điều kiện, giống code:
- mọi nguồn có `sharedStructurePercent < 50` và `reusedExamples` rỗng;
- `repetitions` rỗng;
- mọi `transitions` đều `smooth: true`;
- `arc.builds` là `true`;
- mọi chương có `hasSpecificDetail` và `formFollowed` đều `true`, và có **nhiều nhất 1** chương `mode: explanation` (ví dụ chương tổng kết);
- mọi yếu tố gốc có `inScript: true` và `inSources: false`;
- `thread.inEveryChapter` và `thread.meaningShifts` đều `true`.

## Bước 6 — Prompt 2, bản sửa chương

Dùng **cùng System** như Bước 3. Phần User khác ở chỗ chương cần sửa thấy được cả hai phía:

```
# Chapters already written (continue from here)
<toàn văn các chương TRƯỚC chương N>

# Chapters that follow this one (do not change them; do not repeat their content or examples)
<toàn văn các chương SAU chương N>

Rewrite Chapter <N> (<heading N>) following these instructions.
Instructions: <lỗi cần sửa — có thể dán thẳng ghi chú tiếng Việt của biên tập viên>

Current text:
<toàn văn chương N hiện tại>
Target length: about <số ký tự> characters (±15%).
Form of this chapter / Opening of this chapter / Conflict of this chapter / Action scene of this chapter / central question…: (giữ nguyên các dòng này như Bước 3, Phần B)
[chương 1]  This is the opening: within the first 2-3 sentences touch the viewer's worry or a scene to make the hook, and within 30 seconds promise what the video will make clear. Do not read the chapter heading aloud.
[chương 2+] Start with a natural sentence that picks up the last few sentences of the previous chapter. Do not read the chapter heading aloud.
[có chương sau] The next chapter begins "<3 câu đầu của chương N+1>". End this chapter so that it leads into that opening without a jolt.
[chương cuối] This is the last chapter: summarise the whole video briefly, close with reassuring words, and add one line inviting viewers to share their own experience in the comments.
When you have finished, check that read next to its neighbours the chapter keeps the story one thread, repeats no example, claim or opening, and has no paragraph of generic advice without a particular detail and a person acting. Then output it.
Output only this JSON: {"sentences": [...]}
```

Agent chọn chương cần sửa theo kết quả biên tập:

| Lỗi | Sửa chương nào | Gợi ý cho `Instructions` |
|---|---|---|
| Chuyển chương N→N+1 gượng | N+1 (hoặc N) | dán `note` của biên tập viên |
| Lặp ý giữa chương A và B | B (chương sau) | "chương A đã kể ví dụ X — thay bằng ví dụ/ý mới" |
| Nguồn FAIL cấu trúc | các chương bám nguồn | "đổi thứ tự ý và dùng ví dụ của riêng mình" — nếu đa số chương đều bám nguồn thì quay lại Bước 2 |
| Mạch không tăng dần | các chương "đứng yên" | dán `arc.note` |
| Chương chủ yếu giải thích / chung chung / không đúng hình thức | chương đó | "viết lại thành một cảnh có người làm hay nói gì đó, kèm chi tiết cụ thể (tuổi, số tiền, nơi chốn, giờ, đồ vật)"; dán `note` |
| Yếu tố gốc chưa viết vào, hoặc đã có trong nguồn | chương đáng ra mang yếu tố đó | "viết cụ thể yếu tố X thành một cảnh"; nếu đã có trong nguồn thì thay bằng yếu tố khác |
| Sợi xuyên suốt thiếu hoặc không đổi nghĩa | các chương thiếu | "đưa <thread> vào chương này với một ý nghĩa mới so với chương trước" |
| Trùng video cũ của kênh (lời văn / khuôn chương) | chương trùng, hoặc đổi `form`/`openingType` rồi viết lại | "viết lại, không dùng câu hay ví dụ của video <tên>" |
| Tiêu đề cùng công thức, hoặc hứa "khoa học chứng minh" | không phải chương | đổi cấu trúc câu tiêu đề; bỏ lời hứa chứng minh |
| Lệch độ dài > 15% | chương dài nhất / ngắn nhất | "rút gọn còn khoảng N chữ" / "đào sâu ví dụ, thêm khoảng N chữ" |

Sau mỗi lần sửa, ghép lại `kich-ban.txt` rồi chạy lại Bước 4 và 5.

## Bước 7 — Giọng, ảnh, dựng (không phải LLM)

Các bước này không có prompt để test. Code xử lý như sau:

- **Giọng đọc** ([narration.ts](../server/src/modules/video-agent/narration.ts)):
  - VOICEVOX đọc **từng câu**, mỗi câu có khoảng nghỉ cuối 0,35 giây; giữa hai chương nghỉ thêm 0,8 giây.
  - Phụ đề SRT lấy timing từ chính file âm thanh. Câu dài hơn 28 chữ được cắt dòng ở dấu `、`.
  - Test tay: mở VOICEVOX Editor, dán `kich-ban.txt` (mỗi câu một dòng), chọn cùng giọng và tốc độ, nghe thử các câu có kanji dễ đọc sai.
- **Kiểm độ dài sau khi đọc**:
  - Tốc độ thật = tổng ký tự ÷ số phút đọc thật.
  - Nếu lệch mục tiêu quá ±10%, số ký tự cần thêm/bớt = `(phút mục tiêu − phút thật) × tốc độ thật`, chia cho 2 chương dài nhất (khi cần cắt) hoặc ngắn nhất (khi cần thêm). Sửa bằng Prompt 2 bản sửa.
- **Scene và ảnh**: dùng luồng prompt ảnh có sẵn của dammo, chọn theo niche của kênh. Xem và sửa ở trang **Prompt**; file nằm trong `server/data/prompts/all/<luồng>/`, ví dụ `mochi_senior_scenes`. Đầu vào là file SRT ở trên.
- **Dựng video**: slideshow Ken Burns + giọng đọc + phụ đề, giống pipeline AI của trang Sản xuất video.

Muốn test trọn bước 7 thì nên chạy qua trang `/video-agent` khi đã có `ANTHROPIC_API_KEY` và VOICEVOX đang mở. Bật "Duyệt kịch bản" để dừng lại xem trước khi đọc giọng.

## Checklist chấm tay

**Chống lặp nội dung và chung chung (ưu tiên cao nhất):**
- [ ] Nguồn: 8-gram ≤ 5%, 15-gram ≤ 0,5%; biên tập viên không báo chép trình tự ý hay ví dụ của nguồn.
- [ ] Kênh: không trùng lời văn với video cũ của kênh; tiêu đề không cùng công thức; khuôn chương và kiểu mở khác 5 video gần nhất.
- [ ] Mỗi chương đúng hình thức đã định; hai chương liền nhau không cùng hình thức hay kiểu mở.
- [ ] Mỗi chương có một cảnh người ta làm hay nói điều gì đó, với chi tiết cụ thể (tuổi, số tiền, nơi chốn, giờ, đồ vật). Đoạn nào thay vào video khác cùng chủ đề vẫn dùng được thì viết lại.
- [ ] Mỗi chương có một mâu thuẫn nhỏ (lựa chọn nào cũng mất gì đó), không kết thúc bằng lời khuyên dễ.
- [ ] 3 yếu tố gốc đều thật sự có trong kịch bản và không có trong nguồn.
- [ ] Sợi xuyên suốt xuất hiện ở mọi chương và đổi nghĩa dần; câu hỏi trung tâm được trả lời trọn ở cuối.
- [ ] Tiêu đề không khẳng định "khoa học chứng minh"; nhân vật là ví dụ hư cấu, không giả làm người thật hay "thư của người xem".

**Chung:**

- [ ] Tiêu đề và góc nhìn khác nguồn; người xem sẽ biết điều gì mới?
- [ ] 30 giây đầu (khoảng 165 chữ) có chạm vào nỗi lo cụ thể và hứa một điều không?
- [ ] Đọc liền chương N → N+1: câu mở có tiếp ý câu kết không? Có câu nào kiểu "2つ目は" cụt lủn không?
- [ ] Có ví dụ hay câu chốt nào xuất hiện hai lần không?
- [ ] Có "nghiên cứu", "đại học", "số liệu" nào không kiểm chứng được không?
- [ ] Câu có dài quá khoảng 40 chữ, có ký hiệu hay chữ tiếng Anh làm TTS đọc vấp không?
- [ ] Bước 4 PASS, Bước 5 PASS, độ dài trong ±15%.
