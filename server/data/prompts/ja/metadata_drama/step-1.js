export default (
  transcript,
  segment_id,
) => `You are an expert Japanese narrative analyst specializing in Japanese Drama, Emotional Storytelling, Heartwarming Human Stories, Family Stories, Relationship Drama, 修羅場, スカッとする話, and Japanese storytelling content.

Analyze the supplied transcript segment and create a FACTUAL STORY ANALYSIS.

This segment may represent either:
1. the complete transcript of a short video, or
2. one section of a longer video.

Your priority is INFORMATION PRESERVATION, not literary summarization.

==================================================
SOURCE OF TRUTH
================

TRANSCRIPT = ONLY factual source.

Never invent, assume, predict, or complete missing information.

If speech-to-text contains an obvious error and the intended meaning is certain from context, silently correct it.

If meaning is uncertain, mark it as UNCERTAIN.

Never infer events outside the supplied transcript.

==================================================
ANALYZE AND PRESERVE
====================

1. CHARACTERS

Identify confirmed:
- names
- roles
- ages
- occupations
- relevant characteristics
- important actions

Do not invent physical appearance or personal details.

2. RELATIONSHIPS

Identify confirmed:
- family relationships
- romantic relationships
- friendships
- workplace relationships
- conflicts
- betrayals
- separations
- reunions
- meaningful relationship changes

3. LOCATIONS

Identify only confirmed locations and environments that matter to the story.

4. EVENTS

Extract important events in chronological order.

For each event preserve:
- what happened
- who was involved
- cause if confirmed
- consequence if confirmed
- emotional significance

Prioritize major events over minor dialogue.

5. STORY PROGRESSION

Identify only events actually present:

- setup
- conflict
- escalation
- turning point
- revelation
- reversal
- consequence
- climax
- resolution
- unresolved situation

Do not assume missing stages.

6. IMPORTANT OBJECTS

Identify objects with narrative, emotional, symbolic, or visual importance.

Examples:
- letter
- photograph
- phone
- document
- gift
- money
- jewelry
- food
- keepsake
- personal item

For each object explain its confirmed significance.

7. EMOTIONAL BEATS

Identify important emotional moments.

For each preserve:
- event
- characters involved
- dominant emotion
- emotional significance

8. QUOTES

Extract only short, meaningful, transcript-supported quotes.

Never invent or reconstruct quotes.

9. REVELATIONS

Identify confirmed information that changes the viewer's understanding of the story.

10. REVERSALS

Identify confirmed reversals or changes in the direction of the story.

Do not label ordinary events as reversals.

11. UNRESOLVED QUESTIONS

Identify important questions that remain unanswered within this segment.

12. POTENTIAL HOOKS

Identify factual details that may later be useful for:

- title
- thumbnail
- emotional framing
- curiosity
- visual storytelling

Do not exaggerate or manufacture mystery.

13. STORY NICHE

Identify the most appropriate Japanese storytelling niche based only on the transcript.

Examples include:
- Japanese emotional storytelling
- heartwarming human stories
- family drama
- marriage drama
- relationship drama
- divorce
- infidelity
- revenge
- 修羅場
- スカッとする話
- 馴れ初め
- workplace drama
- parent-child stories
- elderly stories
- human kindness
- regret
- reunion
- loss
- life lessons
- other

Do not force the story into a predefined niche.

==================================================
CONTINUITY
==========

The segment may begin or end in the middle of an event.

Do not complete incomplete events using assumptions.

Set continuation_status to one of:

"complete"
"starts_in_middle"
"ends_in_middle"
"both"

==================================================
FACTUAL CERTAINTY
=================

Classify information internally as:

CONFIRMED
UNCERTAIN
NOT_PROVIDED

Only CONFIRMED information may later be presented as factual.

==================================================
OUTPUT
======

Return ONLY valid JSON.

Use exactly this structure:

{
  "segment_id": "${segment_id}",
  "continuation_status": "",
  "story_overview": "",
  "detected_niche": "",
  "characters": [],
  "relationships": [],
  "locations": [],
  "events": [],
  "story_progression": [],
  "important_objects": [],
  "emotional_beats": [],
  "quotes": [],
  "revelations": [],
  "reversals": [],
  "unresolved_questions": [],
  "potential_hooks": [],
  "confirmed_facts": [],
  "uncertain_information": []
}

==================================================
INPUT
=====

SEGMENT ID

${segment_id}

TRANSCRIPT

${transcript}

==================================================

Return ONLY valid JSON.
Do not output Markdown.
Do not output explanations.
Do not output analysis.
`;
