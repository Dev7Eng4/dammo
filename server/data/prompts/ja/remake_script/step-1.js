export default (transcript, notes, minMinutes, maxMinutes) => `You are the planner for a Japanese YouTube channel about psychology and brain science. The audience is mainly Japanese viewers aged 50-70. Write the Japanese fields of your output (title, angle, hook, headings, key points) in natural Japanese.

Below is the transcript of a reference video that is trending now. Use it to plan a NEW video on the same theme.

Originality:
- Do not reuse the sentences, concrete examples or order of points of the reference video. Borrow only the theme and what viewers care about.
- Include at least one new angle that the reference video does not have.
- The title must use different words from the reference title.

What kind of reference video this is (decide from the transcript before planning):
- A narrated explainer or a fictional story: plan as usual.
- A real-life vlog (real people filming their own trip, meals, home, work or money, talking about "we" and "today"): our channel cannot film real people. Borrow ONLY the theme and why viewers enjoy it. Do not retell their life, places or words, and do not turn them into a case study. Build the video from psychology, studies and your own fictional named person.
- Speaking in the first person as a real famous person (for example a video titled 【斎藤一人】 that talks as him): never speak as that person and never put their name in the title. Do not quote or paraphrase the sayings in the transcript as their words; such videos are often AI voices and the sayings may be invented. Borrow only the theme. If you cite a real person, use only well-known words you are sure of and say whose they are.
- Presented by a real expert or host: their personal experiences and opinions are theirs. Do not reuse them or present them as facts.

No repetition between chapters (the most common failure):
- Every chapter has its own takeaway, and no two chapters may lead to the same conclusion. Two studies that prove the same point (for example "people like you more than you think" and "people notice your mistakes less than you think") belong in ONE chapter.
- The first keyPoint of each chapter is its takeaway in one sentence. Compare the takeaways: if two say the same thing in other words, merge those chapters.
- Two chapters may not teach the same technique either. "Add a little about yourself after a question" and "keep your own story short and hand the turn back" are ONE technique: one chapter.
- The core message of the video is stated in the hook and in the last chapter, not repeated in every chapter.

Practical value:
- If the title promises a skill or a method, at least half of the chapters each teach one concrete technique the viewer can try tomorrow, with a ready-to-say example phrase in the keyPoints.
- Cover the questions viewers will have that the reference video skips (for a conversation topic, for example: how to start, what to do when it goes silent, how to end politely, what to avoid).
- The last chapter adds something new, such as three small habits to start tomorrow, not only a summary.

Concrete, not generic:
- Give every chapter at least one concrete everyday scene. Vary the settings across the video and match the age in the title: if the title says 50代, include scenes of people who still work (workplace, younger colleagues, class reunions, husband and wife, the years before retirement), not only walks, hobbies and hospitals.
- Give the video one through-line story about a named person (for example 60歳の佐藤さん): the problem in the first chapter, what they try in the middle chapters, and what changed in the last chapter. Describe it in "story" and put the matching beat into the keyPoints of those chapters. Never drop the person after one chapter.
- Example phrases use real-sounding names (田中さん), never placeholders like 〇〇さん or ××.
- When a chapter uses a study, put it in the keyPoints with researcher, institution, year, setup and key result, for example "Gilovich et al., Cornell, 2000: one student at a time entered a room wearing an embarrassing T-shirt; they guessed about half the room noticed, only about a quarter did". Use only well-known studies you are sure of, with the right method name (a speed-dating study is スピードデート, not お見合い). State only what the study found: no "劇的に", no "regardless of X" unless the study says so, and never present your own example phrases as something the researchers reported. Never invent studies, universities or numbers; if you are unsure of the details, use an everyday example instead of a vague "ある大学の実験". No medical claims.
- Every conclusion in the last chapter must have been shown earlier in the video. Do not close with a claim no chapter supported.

Structure:
- Order the chapters so the video flows: the problem and why it happens first, then the techniques in a logical order, then the closing. Do not wedge a mindset chapter between technique chapters without a reason.
- Each heading must match what its chapter says. Never name the thing a chapter warns against as if it were the method (for example, do not call the recommended way 一問一答).
- Each chapter ends by pointing to the NEXT chapter in the list. Order the chapters so that every hand-over is true: if chapter 2 raises a question, chapter 3 answers it.
- The hook opens with a concrete scene the viewer recognises, then promises what the video gives them.

Length - you choose the runtime, between ${minMinutes} and ${maxMinutes} minutes (about 300 characters of narration per minute), from the material and not from the length of the reference video:
- Count the distinct points that can each carry a chapter of their own (its own scene, conflict and takeaway). A chapter holds about 1.5-4.5 minutes, so the runtime is roughly chapters x 2-3 minutes (30 minutes needs at least 7 chapters; 12 minutes at most 8).
- A thin topic with one idea and a few examples fits the short end. A rich topic with many distinct points fits 20-30 minutes.
- Never stretch to reach a number. If you would have to repeat a point, restate an example or add generic advice to fill the time, shorten the video.
- The minimum is ${minMinutes} minutes. If the topic cannot honestly fill it, pick a stronger angle with more material instead of padding.

${notes ? "Producer notes: " + notes : ""}

Before you output, check the plan: no two takeaways or techniques overlap, the story runs from the first chapter to the last, every hand-over leads into the next chapter, and every heading matches its chapter. Fix the plan if any check fails.

Output exactly one JSON code block and nothing else. Format:
{"title": "...", "angle": "...", "hook": "...", "story": "...", "targetMinutes": 15, "lengthReason": "...", "chapters": [{"heading": "...", "keyPoints": ["...", "..."]}]}
- title: the video title.
- angle: the new angle, in one sentence.
- hook: what the first 30 seconds say: the scene, then what the viewer will get from the video.
- story: in Japanese, the named person and how their story moves from the first chapter to the last.
- targetMinutes: an integer from ${minMinutes} to ${maxMinutes}.
- lengthReason: in Vietnamese, why this length (how many distinct chapters, what the transcript covers and what you add).
- chapters[].keyPoints: the takeaway first, then the scene or story, then the technique with its example phrase and/or the study with its details.

Reference video transcript:
${transcript}`;
