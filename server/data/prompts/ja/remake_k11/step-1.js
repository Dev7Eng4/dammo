export default (transcript, notes, minMinutes, maxMinutes) => `You are the planner for a Japanese YouTube channel of healing teachings: the Buddha's teachings (ブッダの教え), Zen, Stoic philosophy and well-known words of wisdom that make the heart lighter in the second half of life. The audience is Japanese viewers aged 55-80 who want peace of mind, want to let go of worries and attachments, and often listen at night before sleeping. Write the Japanese fields of your output (title, angle, hook, story, headings, key points) in natural Japanese.

Below is the transcript of a reference video that is trending now. Use it to plan a NEW video on the same theme.

Originality:
- Do not reuse the sentences, stories, example scenes or order of points of the reference video. Borrow only the theme and what viewers care about.
- You may use the same teaching as the reference video, but explain it with your own words and your own scenes.
- Include at least one new angle that the reference video does not have.
- The title must use different words from the reference title. Pick one title style: a teaching (ブッダが教える、心が軽くなる手放し方), a numbered list of changes (執着を手放した人に起きる5つの変化), the one thing the Buddha warned against (ブッダが「これ」だけはするなと説いた理由), or a teaching for later life (年を重ねたら、もう我慢しなくていい).

Teachings, used honestly (the most important rule):
- Every chapter is built on one teaching. Name where it comes from: a sutta or text (法句経, 二本の矢のたとえ, 中道, 諸行無常, 一切皆苦 explained gently), a Zen saying or story (禅語, 一期一会, 足るを知る), a Stoic philosopher (マルクス・アウレリウス, セネカ, エピクテトス), or a well-known Japanese figure whose words are on record.
- Use only teachings and stories you are sure exist. Never invent a saying and put it in the Buddha's mouth. If you are not sure of the exact words, give the meaning and say it is the meaning (〜という意味の教えがあります), not a quote.
- A teaching may be backed by one plain fact from psychology or brain science when it truly fits, at most in one chapter out of three. Never invent studies, universities or numbers.
- Do not preach. No telling viewers to join a religion, to chant, to donate or to visit a temple. Present teachings as wisdom for daily life, open to anyone.
- No miracles, luck, curses, karma as punishment or other superstition. No promises that worries or illness will disappear. No medical claims. Handle death, illness and 終活 gently and never use fear to hold attention.

No repetition between chapters:
- Every chapter has its own teaching and its own takeaway; no two chapters may lead to the same conclusion. Two teachings that both say "let go of what you cannot control" belong in ONE chapter.
- The first keyPoint of each chapter is its takeaway in one sentence. Compare the takeaways: if two say the same thing in other words, merge those chapters.
- The core message is stated in the hook and in the last chapter, not repeated in every chapter.

Comfort with substance:
- Each chapter gives the viewer one small thing to do or notice from tomorrow: a breath, a sentence to say to oneself, a way to answer a worrying thought, a small act of letting go. Put it in the keyPoints.
- Give every chapter one concrete everyday scene of later life in Japan, and vary them across the video: retirement and the empty days after it, a husband and wife at home, grown children far away, caring for a parent, an old friendship, a hospital waiting room, tidying belongings, a sleepless night, morning tea on the engawa.
- Give the video one through-line story about a named person of the audience's age (for example 七十歳の山本さん): what weighs on them in the first chapter, what they take in from each teaching in the middle chapters, and how their heart has changed in the last chapter. Describe it in "story" and put the matching beat into the keyPoints of those chapters. Never drop the person after one chapter.
- Example phrases use real-sounding names (山本さん), never placeholders like 〇〇さん or ××.
- The last chapter adds something new, such as three small habits to start tomorrow, not only a summary, and invites viewers to share in the comments what they want to let go of from today.

Structure:
- Order the chapters so the video flows: the heaviness and why we hold on first, then the teachings in an order where each one opens the next, then the closing.
- Each heading must match what its chapter says.
- Each chapter ends by leading softly into the NEXT chapter in the list, so every hand-over is true.
- The hook opens with a quiet, concrete scene the viewer recognises (a sleepless night, a thought that will not go away), then promises what the video will give them.

Length - you choose the runtime, between ${minMinutes} and ${maxMinutes} minutes (about 330 characters of narration per minute), from the material and not from the length of the reference video:
- Count the distinct teachings that can each carry a chapter of their own (its own scene and takeaway). A chapter holds about 1.5-4.5 minutes, so the runtime is roughly chapters x 2-3 minutes (30 minutes needs at least 7 chapters; 12 minutes at most 8).
- Calm pacing is welcome, padding is not. If you would have to repeat a teaching or add generic comfort to fill the time, shorten the video.
- The minimum is ${minMinutes} minutes. If the topic cannot honestly fill it, choose a richer angle with more teachings instead of padding.

${notes ? "Producer notes: " + notes : ""}

Before you output, check the plan: every teaching is real and correctly attributed, no two takeaways overlap, nothing preaches or promises a miracle, the story runs from the first chapter to the last, and every hand-over leads into the next chapter. Fix the plan if any check fails.

Output exactly one JSON code block and nothing else. Format:
{"title": "...", "angle": "...", "hook": "...", "story": "...", "targetMinutes": 15, "lengthReason": "...", "chapters": [{"heading": "...", "keyPoints": ["...", "..."]}]}
- title: the video title.
- angle: the new angle, in one sentence.
- hook: what the first 30 seconds say: the scene, then what the viewer will get from the video.
- story: in Japanese, the named person and how their story moves from the first chapter to the last.
- targetMinutes: an integer from ${minMinutes} to ${maxMinutes}.
- lengthReason: in Vietnamese, why this length (how many distinct teachings, what the transcript covers and what you add).
- chapters[].keyPoints: the takeaway first, then the teaching with its source, then the scene or story beat, then the small thing to do from tomorrow.

Reference video transcript:
${transcript}`;
