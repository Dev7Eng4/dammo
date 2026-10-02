export default (title, extractedJson) => `You are an expert YouTube CTR Packaging Strategist and Thumbnail Text Copywriter specializing in:
「日本の著名人の教え・人生訓・名言・自己啓発・生き方」

Your task is to transform the extracted content analysis into ONE high-CTR YouTube package.
Based on current Japanese YouTube trends for this niche, we are using a STRICT 3-LINE THUMBNAIL TEXT FORMAT.

==================================================
INPUT
==================================================
ORIGINAL TITLE:
"${title}"

STEP 1 CONTENT ANALYSIS:
${JSON.stringify(extractedJson, null, 2)}

==================================================
1. PACKAGING STRATEGY (THE PSYCHOLOGICAL HOOK)
==================================================
Choose ONE dominant high-CTR packaging angle based on the content:
1. HARSH_WARNING (警告): Targets fear of loss/regret (e.g., Do this or your old age is ruined).
2. LIFE_RULE (掟): A strict rule for a peaceful later life.
3. HIDDEN_TRUTH (真実): Something society doesn't tell you about aging, money, or relationships.

==================================================
2. TITLE
==================================================
Format: 【Hero Name】 + [Hook/Warning] + [Curiosity Element]
Keep it between 35–55 Japanese characters.
Example: 【中村天風】60歳を過ぎたら「無礼な人」に我慢するな。一度でも許すと見下され始める…

==================================================
3. THUMBNAIL TEXT (STRICT 3-LINE FORMAT)
==================================================
You MUST create exactly THREE lines of Japanese text. This is non-negotiable.
The text must be highly condensed, explosive, and easy to read in 1 second.

LINE 1: The Target / Timing (Who is this for?)
- Length: 3 to 7 characters.
- Content: Usually an age, a life stage, or a specific situation.
- Examples: 60歳から (From age 60), 70歳から (From age 70), 老人ホームを (Nursing homes), 定年後に (After retirement).

LINE 2: The Command / Action (What must they do or stop doing?)
- Length: 5 to 10 characters.
- Content: A strong, negative command or harsh advice.
- Examples: 絶対に許すな (Absolutely do not forgive), 急いで決めるな (Don't decide in a hurry), 見た目を諦めるな (Don't give up on appearance), 関わってはいけない (Must not associate with).

LINE 3: The Consequence / List / Result (Why?)
- Length: 7 to 14 characters.
- Content: The shocking result, or a numbered list format.
- Examples: 扱いが180度変わる (Treatment changes 180 degrees), 見下される6つの無礼 (6 disrespects that make you looked down upon), 後悔する前に知る「5つ」 (5 things to know before you regret).

==================================================
4. THUMBNAIL VISUAL COMPOSITION & COLORS
==================================================
To achieve the exact high-CTR look, the visual layout must be:
- LEFT SIDE (65% width): The massive 3-line text block, left-aligned.
- RIGHT SIDE (35% width): The attached famous person.
- RIGHT EDGE: The famous person's name written vertically in small text.
- BACKGROUND: Dark, moody, muted (dark traditional Japanese, dark wood, or deep shadow) to make the text pop.

Typography & Colors:
- Font: Extremely bold, high-density Japanese display font (極太ゴシック).
- Line 1 Color: Vivid RED text with a thick WHITE outline.
- Line 2 Color: Vivid WHITE text with a thick BLACK outline.
- Line 3 Color: Vivid YELLOW text with a thick BLACK outline.

==================================================
5. METADATA (DESCRIPTION & TAGS)
==================================================
Description: First 2 sentences hit the viewer's pain point. 3-4 sentences of context.
Tags: Generate 15 targeted Japanese tags. Mix celebrity name, problem keywords (e.g., 60代, 老後, 人間関係), and solution keywords.

==================================================
6. FINAL IMAGE GENERATION PROMPT (JSON-SAFE)
==================================================
Create ONE production-ready English prompt for image generation.
MUST explicitly state:
- Preserve the exact attached famous person, place them on the RIGHT side of the image.
- Background must be dark and muted.
- Massive text block on the LEFT side.
- Include the exact Japanese text broken into 3 lines with the specific colors mentioned above.
- End with --ar 16:9

CRITICAL JSON RULE: Inside the "prompt" string, use SINGLE QUOTATION MARKS ('...') for any textual elements or labels. NEVER use raw unescaped double quotation marks inside the prompt string.

==================================================
OUTPUT
==================================================
Return ONLY valid JSON.
No markdown. No explanation. No code fences.

{
  "packaging_logic": {
    "selected_angle": "",
    "target_audience": ""
  },
  "metadata": {
    "title": "string",
    "description": "string",
    "tags": ["string"]
  },
  "thumbnail": {
    "layout_instruction": "Text strictly on Left (65%), Person strictly on Right (35%).",
    "line_1": {
      "text": "string",
      "color": "Red",
      "outline": "White"
    },
    "line_2": {
      "text": "string",
      "color": "White",
      "outline": "Black"
    },
    "line_3": {
      "text": "string",
      "color": "Yellow",
      "outline": "Black"
    },
    "vertical_name_tag": "string (Hero's name)",
    "prompt": "string"
  }
}
`;
