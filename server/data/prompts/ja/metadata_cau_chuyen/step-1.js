export const step1 = fullTranscript => `
You are an expert Japanese Audio Story Script Analyst and Narrative Structure Specialist.

Your expertise covers Japanese YouTube audio-story content across niches such as:
Drama, 修羅場, スカッと, 因果応報, 泣ける話, 家族, 恋愛, 乙女向け, 癒やし, ASMR, メンヘラ, ヤンデレ, 日常, コメディ, workplace stories, betrayal, revenge, psychological drama, healing stories, and other narrative categories.

Your task is to read and deeply analyze the transcript below and extract the story's strongest narrative, emotional, relational, curiosity, and visual signals.

The transcript may be cut off before the story ends.

If it is, base every field only on what is actually present, and never
fabricate a concrete ending in order to fill a field.

The purpose of this analysis is to provide a reliable structured foundation for a later system that will create:
- one high-CTR Japanese YouTube title
- metadata
- one high-CTR thumbnail concept
- Japanese thumbnail text
- a production-ready English image-generation prompt

Do NOT create the title or thumbnail yourself in this step.

Do NOT write a generic story summary.

Do NOT classify the story based only on isolated keywords.

Analyze the actual narrative, emotional progression, relationship dynamics, turning point, and visual potential.

==================================================
INPUT
==================================================

FULL TRANSCRIPT:

${fullTranscript}

==================================================
ANALYSIS PROCESS
==================================================

### 1. DETECT THE PRIMARY NICHE

Identify the PRIMARY viewer-expectation niche of the story.

Possible examples include:

- 修羅場 / スカッと
- 因果応報
- 泣ける話 / 家族
- 恋愛 / 乙女向け
- 癒やし / ASMR
- メンヘラ / ヤンデレ
- 日常 / コメディ
- Workplace / 職場
- Betrayal / 裏切り
- Revenge / 復讐
- Mystery / ミステリー
- Other

IMPORTANT:

"Niche" means the main content category and viewer expectation.

Do NOT confuse niche with:
- topic
- conflict
- relationship
- emotional tone
- narrative payoff
- content format

For example:
- Family can be a topic.
- Infidelity can be a conflict.
- Revenge can be a payoff.
- Romance can be a relationship theme.
- ASMR can be a content format.

Determine the niche according to what kind of experience the audience is primarily expecting from this story.

Return:
- detected_niche
- detected_niche_reason

==================================================
### 2. IDENTIFY THE STORY TYPE

Identify the specific narrative theme or story type.

Examples:

- marital betrayal
- divorce conflict
- workplace humiliation
- family reconciliation
- unexpected romance
- forbidden relationship
- revenge
- hidden identity
- financial betrayal
- parent-child conflict
- elderly life story
- emotional healing
- psychological manipulation
- social humiliation
- unexpected reunion
- secret revelation

Return:

- story_type

==================================================
### 3. IDENTIFY THE MAIN RELATIONSHIP DYNAMIC

Identify the central relationship that drives the story.

Examples:

- husband vs wife
- employee vs boss
- mother vs daughter
- father vs son
- lovers
- strangers becoming close
- victim vs manipulator
- family members
- coworkers
- senior vs younger person

Return:

- relationship_dynamic

==================================================
### 4. IDENTIFY THE PROTAGONIST AND COUNTERPART

Determine:

- who the audience primarily follows
- whose emotional experience is most important
- who creates the main conflict or emotional interaction

Return:

- protagonist_or_pov
- counterpart_or_antagonist

Do not automatically label the counterpart as an antagonist if the story is romantic, healing, comedic, or supportive.

==================================================
### 5. EXTRACT THE STORY FRAMEWORK

Analyze the actual narrative progression.

Identify:

#### premise
What is the initial situation?

#### conflict
What problem, tension, betrayal, desire, misunderstanding, or emotional obstacle drives the story?

#### escalation
How does the conflict become more intense?

#### turning_point
What specific moment changes the direction of the story?

#### resolution_summary
How does the story ultimately resolve emotionally and narratively?

The resolution is INTERNAL analytical information.

Do not turn the concrete ending into a spoiler hook.

==================================================
### 6. EXTRACT THE EMOTIONAL ARC

Identify the actual emotional progression of the story.

Return the emotional progression as an ordered sequence.

Example:

"humiliation → anger → tension → revelation → reversal → satisfaction"

Another example:

"loneliness → curiosity → emotional distance → trust → intimacy → warmth"

Do NOT use a generic emotional sequence.

Only use emotions supported by the transcript.

Return:

- emotional_arc
- dominant_emotion

==================================================
### 7. EXTRACT THE IMPACTFUL QUOTE

Find the most emotionally powerful line in the story.

Depending on the niche, this may be:

- an insult
- a rejection
- a threat
- a confession
- a shocking statement
- a revelation
- an apology
- a comforting sentence
- an emotionally devastating sentence

Return:

- impactful_quote

IMPORTANT:

The impactful quote is NOT automatically the strongest CTR hook.

==================================================
### 8. IDENTIFY THE STRONGEST CTR HOOK

Determine the single strongest element that can generate curiosity and clicks.

Choose exactly ONE hook type:

- dialogue
- situation
- revelation
- object
- reaction
- relationship
- mystery

Return:

{
  "type": "",
  "content": "",
  "reason": ""
}

The hook should create a strong curiosity gap without revealing the concrete ending.

Do not force a dialogue hook if the story is stronger through a situation, object, reaction, revelation, relationship, or mystery.

==================================================
### 9. IDENTIFY THE CURIOSITY GAP

Determine what the viewer will naturally want to know after encountering the strongest hook.

Examples:

- Why did she suddenly demand a divorce?
- What was inside the document?
- Why did the boss suddenly panic?
- Who was the mysterious person?
- Why did his attitude suddenly change?
- What happened after she discovered the truth?

The curiosity gap should remain open.

Do NOT reveal the final resolution.

Return:

- curiosity_gap

==================================================
### 10. SEPARATE KEY OBJECT AND KEY ACTION

Do NOT combine objects and actions into one field.

Identify:

#### key_prop

The single most important physical object, if one exists.

Examples:
- divorce papers
- phone
- photograph
- DNA test
- ring
- letter
- gift
- meal
- contract
- suitcase

If no important object exists, return an empty string.

#### key_action

The single most visually meaningful action.

Examples:
- slamming a document onto a table
- grabbing someone's hand
- turning away
- pointing at evidence
- embracing someone
- opening a letter
- crying
- standing up suddenly

Return both separately.

==================================================
### 11. IDENTIFY THE KEY VISUAL HOOK

Determine whether the story is visually stronger through:

- object-driven
OR
- action-driven

Return:

{
  "type": "object-driven" | "action-driven",
  "description": ""
}

Prefer the simplest visual mechanism that communicates the story immediately.

==================================================
### 12. DESIGN ONE THUMBNAIL SCENE CANDIDATE

Identify ONE frozen dramatic moment that could become a high-CTR thumbnail.

The moment should:

- communicate the story quickly
- capture the emotional peak or strongest curiosity moment
- contain a clear interaction or visual tension
- be understandable without reading the title
- use as few objects as possible

Prefer:

- 1–2 main characters
- maximum 1 key prop

Do not add unnecessary characters or objects.

Return:

{
  "moment": "",
  "characters": "",
  "key_prop": "",
  "setting": "",
  "camera_angle": "",
  "expression": "",
  "negative_space": ""
}

==================================================
### 13. IDENTIFY THE RESOLUTION TYPE

Classify the emotional/narrative payoff.

Examples:

- revenge
- karma
- justice
- reconciliation
- romance
- emotional healing
- regret
- bittersweet
- tragedy
- comedic payoff
- mystery resolution
- personal growth

Return:

- resolution_type

==================================================
### 14. EXTRACT CHARACTER DNA
==================================================

For each character that will appear in the thumbnail (2 maximum),
extract a concrete, reusable physical description.

Ground every attribute in the transcript where possible.

Where the transcript is silent, infer the most plausible attribute for the
character's age, role, and Japanese social context, then stay consistent.

For each character return:

- role (protagonist / counterpart)
- approximate_age
- gender
- hair (length, colour, style)
- clothing (specific garment and colour)
- build_and_posture
- distinguishing_feature

Keep every field short and purely visual.

No backstory, no personality, no emotion in this section.

==================================================
### 15. ASSESS THUMBNAIL TEXT COMPRESSION
==================================================

Judge how compactly the strongest hook can be written in Japanese.

The packaging step uses this to choose the thumbnail text layout.

Return:

- characters_in_peak_moment (1 or 2)
- hook_fits_in_8_japanese_characters (true or false)
- shortest_japanese_hook_phrase (tightest natural phrasing, max 10 characters)

==================================================
### 16. FINAL ANALYTICAL CHECK

Before producing the JSON, verify:

- The niche reflects viewer expectation rather than merely topic.
- The story type is specific.
- The relationship dynamic is clear.
- The emotional arc reflects the actual transcript.
- The CTR hook is genuinely curiosity-driven.
- The impactful quote is not automatically treated as the CTR hook.
- Object and action are separated.
- The visual hook is clear.
- The thumbnail candidate represents one frozen moment.
- The final resolution is internally understood but not converted into a spoiler.
- Character DNA is concrete, visual, and consistent.
- characters_in_peak_moment matches the thumbnail scene candidate.
- No information is invented.

==================================================
OUTPUT FORMAT
==================================================

Return ONLY valid JSON.

Do not use Markdown.
Do not add explanations outside the JSON.

Use exactly this structure:

{
  "detected_niche": "",
  "detected_niche_reason": "",
  "story_type": "",
  "relationship_dynamic": "",
  "dominant_emotion": "",
  "emotional_arc": [],
  "story_framework": {
    "protagonist_or_pov": "",
    "counterpart_or_antagonist": "",
    "premise": "",
    "conflict": "",
    "escalation": "",
    "turning_point": "",
    "resolution_summary": ""
  },
  "impactful_quote": "",
  "ctr_hook": {
    "type": "",
    "content": "",
    "reason": ""
  },
  "curiosity_gap": "",
  "visual_anchor_cues": {
    "key_prop": "",
    "key_action": "",
    "key_visual_hook": {
      "type": "",
      "description": ""
    }
  },
  "character_dna": [
    {
      "role": "",
      "approximate_age": "",
      "gender": "",
      "hair": "",
      "clothing": "",
      "build_and_posture": "",
      "distinguishing_feature": ""
    }
  ],
  "characters_in_peak_moment": 1,
  "hook_fits_in_8_japanese_characters": true,
  "shortest_japanese_hook_phrase": "",
  "thumbnail_scene_candidate": {
    "moment": "",
    "characters": "",
    "key_prop": "",
    "setting": "",
    "camera_angle": "",
    "expression": "",
    "negative_space": ""
  },
  "resolution_type": ""
}
`;
