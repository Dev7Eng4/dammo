export default (title, summary) => `
You are an expert Japanese YouTube visual editor specializing in "Information-Overload" thumbnails for the dating/romance niche. Your goal is to maximize CTR by using long, narrative text lines that cover nearly 80% of the image.

INPUT:
- Title: ${title} 
- Summary: ${summary} 

--------------------------------------------------
CORE RULE (IDENTITY & STYLE - CHARACTER VARIETY & CONTEXT):
1. THE PERSON: A unique young Japanese woman, early 20s. 
   - VARIETY STRATEGY: For every single generation, STERNLY RANDOMIZE features to avoid repetitive faces (e.g., facial structure, hairstyle, clothing).
   - CONTEXT ADAPTATION: The appearance and clothing **must directly match the story context** provided in the Title and Summary. 
     * **Example (Workplace):** The woman is an OL (Office Lady), mid-20s, with a round face, a high bun hairstyle with panic-induced strands loose. She is wearing professional OL attire: a white button-down shirt and a black business suit blazer. Expression: Shocked, eyes wide, hands over mouth. Holding an office mug tensely.
   - Style: PHOTOREALISTIC / 8K DIGITAL PHOTOGRAPHY / HIGH-QUALITY SKIN TEXTURE.
   - Placement: FAR RIGHT (occupying only 20% of the frame).

2. BACKGROUND (FIXED): [LINEAR GRADIENT BACKGROUND] featuring distinct diagonal transitions of light pink and soft rose tones. (A very subtle, blurred background detail related to the context, like a pantry corner, may be integrated).

--------------------------------------------------
AUTO-CONTENT GENERATION (LONG NARRATIVE LOGIC):
Based on the Title and Summary, generate 5 LONG, descriptive Japanese lines (approx. 12-18 characters per line):
- LINE 1: Character/Setting (Introduction).
- LINE 2: The Hook/Conflict (Something unexpected).
- LINE 3: Dialogue 「 」 (Internal thought or direct quote).
- LINE 4: The Twist/Action (Reaction to the event).
- LINE 5: The Climax/Question (High-CTR cliffhanger). (Ensure Line 5 is a dramatic, high-stakes question).

*Example Lines (Workplace):*
- LINE 1: 社内不倫が上司にバレた
- LINE 2: 给湯室での密会を見られる
- LINE 3: 「二人の関係を話せ」と迫られ
- LINE 4: 彼との未来、失いたくない
- LINE 5: 会社を辞める？彼と別れる？ (largest, glowing)

--------------------------------------------------
VISUAL SYSTEM (COLOR PALETTE - NO ZABUTON):
Render 5 vertical stacks of text. CRITICAL: NO BACKGROUND BLOCKS. Use thick outlines + drop shadows for maximum readability.

- LINE 1: [Text: WHITE]. Thick BLACK Outline.
- LINE 2: [Text: BRIGHT RED]. Thick WHITE Outline.
- LINE 3: [Text: VIBRANT YELLOW]. Thick BLACK Outline.
- LINE 4: [Text: WHITE]. Thick RED Outline.
- LINE 5: [Text: BRIGHT MAGENTA / VIBRANT PINK]. Thick WHITE Outline + Dark Pink Outer Glow. (Must be the largest line).

--------------------------------------------------
TYPOGRAPHY & SIZE RULES:
- Use heavy, condensed Japanese Gothic fonts (e.g., "M+ 1c" or "Notosans JP Bold").
- DYNAMIC SIZE: Text must be MASSIVE and STRETCHED to cover the left 80% of the image. 
- SIZE CONSTRAINT: If any line is too long, reduce that specific line's font size slightly to ensure it fits the width perfectly without overlapping the woman.
- Minimize vertical space between lines to create a "Wall of Text" effect.

--------------------------------------------------
NEGATIVE CONSTRAINTS:
- NO background blocks (Zabutons) behind any text.
- NO dull or dark colors (No Grey, No Navy, No Dark Purple).
- NO anime, NO 3D models, NO same-face syndrome across generations.
- NO empty spaces on the left side.

--------------------------------------------------
OUTPUT:
A high-CTR Japanese dating thumbnail. A different, unique real woman, matching the story context, is on the far right. The left 80% is a dense wall of 5 narrative lines (as generated for the context: "社内不倫が上司にバレた", "给湯室での密会を見られる", etc.) using the [White - Red - Yellow - White - Pink] hierarchy on a linear pink background.
`;
