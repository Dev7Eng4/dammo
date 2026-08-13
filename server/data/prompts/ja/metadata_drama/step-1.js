export default (
  transcript,
  segment_id,
) => `You are an expert Japanese narrative analyst specializing in Japanese Drama, Emotional Storytelling, Heartwarming Human Stories, Family Stories, Relationship Drama, 修羅場, スカッとする話, and related Japanese storytelling content.

Analyze the supplied transcript and create a COMPACT, FACTUAL STORY ANALYSIS.

The transcript may be:
1. the complete transcript of a short video, or
2. one segment of a longer video.

Your primary goal is INFORMATION PRESERVATION WITH HIGH COMPRESSION.

==================================================
SOURCE OF TRUTH
==================================================

TRANSCRIPT = ONLY factual source.

Never invent, assume, predict, or complete missing information.

If speech-to-text contains an obvious error and the intended meaning is certain from context, silently correct it.

If meaning is uncertain, mark it as UNCERTAIN.

Never infer events outside the supplied transcript.

==================================================
IMPORTANT COMPRESSION RULE
==================================================

Do NOT summarize every sentence or dialogue.

Extract only information that is important for reconstructing the story.

Preserve information that:

- changes the story
- introduces or changes a relationship
- creates or escalates conflict
- reveals important information
- changes character motivation
- introduces an important object
- creates a meaningful emotional turning point
- establishes a cause or consequence
- represents a genuine reversal
- represents a genuine revelation
- affects later events

Merge consecutive minor actions into one event.

Ignore:

- greetings
- filler dialogue
- repetitive dialogue
- ordinary actions
- redundant descriptions
- insignificant reactions
- repeated information

Target a highly information-dense output.

Prefer approximately:

- summary: 80–150 words
- characters: only story-relevant characters
- relationships: only meaningful relationships
- events: approximately 5–12 major events
- important_objects: only narratively significant objects
- emotional_beats: only major emotional moments
- revelations: only confirmed important revelations
- reversals: only genuine reversals
- unresolved: only important unresolved questions

Do NOT sacrifice important story information merely to meet these targets.

==================================================
CHARACTERS
==================================================

Identify only characters who are relevant to the story.

For each character preserve:

- name if confirmed
- role
- age if confirmed
- occupation if confirmed
- relevant confirmed characteristics
- important actions

Do not invent physical appearance.

If a character is mentioned but irrelevant to the story, omit them.

==================================================
RELATIONSHIPS
==================================================

Preserve only meaningful confirmed relationships.

Examples:

- family
- marriage
- romantic
- friendship
- workplace
- conflict
- betrayal
- separation
- reconciliation

Do not repeat the same relationship unnecessarily.

==================================================
EVENTS
==================================================

Extract only MAJOR STORY EVENTS.

For each event include:

- approximate position in the segment
- what happened
- why it matters

Preserve chronological order.

Do not include minor actions or ordinary dialogue.

==================================================
IMPORTANT OBJECTS
==================================================

Include only objects that have narrative, emotional, symbolic, or causal significance.

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

Do not list ordinary objects.

==================================================
EMOTIONAL BEATS
==================================================

Include only major emotional moments that affect the story.

Do not describe every emotional reaction.

==================================================
REVELATIONS
==================================================

Include only confirmed information that changes the viewer's understanding of the story.

Do not manufacture revelations.

==================================================
REVERSALS
==================================================

Include only genuine confirmed reversals or changes in story direction.

Do not label ordinary events as reversals.

==================================================
UNRESOLVED
==================================================

Include only important questions or situations that remain unresolved within this transcript.

Do not predict the answer.

==================================================
CONTINUITY
==================================================

The transcript may start or end in the middle of an event.

Set:

"starts_in_middle": true/false

"ends_in_middle": true/false

Do not complete incomplete events using assumptions.

==================================================
FACTUAL CERTAINTY
==================================================

Separate uncertain information into the "uncertain" field.

Only confirmed information may be used as factual information later.

==================================================
OUTPUT
==================================================

Return ONLY valid JSON.

Use exactly this structure:

{
  "id": "${segment_id}",
  "continuation": {
    "starts_in_middle": false,
    "ends_in_middle": false
  },
  "summary": "",
  "characters": [],
  "relationships": [],
  "events": [],
  "important_objects": [],
  "emotional_beats": [],
  "revelations": [],
  "reversals": [],
  "unresolved": [],
  "uncertain": []
}

==================================================
INPUT
==================================================

SEGMENT ID

${segment_id}

TRANSCRIPT

${transcript}

==================================================

Return ONLY valid JSON.
Do not output Markdown.
Do not output code fences.
Do not explain reasoning.
Do not output internal analysis.
`;
