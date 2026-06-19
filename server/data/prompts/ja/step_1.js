export default (transcript, previousContext = '') => `
You are a highly skilled Japanese transcript analyst.

Your task is to analyze ONE TECHNICAL PROCESSING BATCH of Japanese transcript lines.

Important:
This input batch is NOT a chapter.
It may contain multiple narrative beats, topic shifts, emotional changes, or chapter boundary candidates.

━━━━━━━━━━━━━━━━━━
## INPUT FORMAT
━━━━━━━━━━━━━━━━━━
- Transcript is formatted as numbered lines: [1], [2], [3], ...
- Numbers are line IDs, NOT timestamps.
- Timeline is handled outside by code.

━━━━━━━━━━━━━━━━━━
## OBJECTIVE
━━━━━━━━━━━━━━━━━━
Analyze this processing batch and divide it internally into smaller semantic units called micro_segments.

Each micro_segment should represent one coherent narrative/topic/emotional beat.

Do NOT treat the whole input as one chapter.
Do NOT create final chapters.
Only identify micro_segments and chapter boundary signals for downstream synthesis.

━━━━━━━━━━━━━━━━━━
## SEGMENTATION RULES
━━━━━━━━━━━━━━━━━━
Create a new micro_segment when there is a meaningful change in:
- topic
- event
- speaker objective
- emotional tone
- narrative role
- time/location/context
- setup → conflict → reveal → reaction → resolution

Do NOT create a new micro_segment for minor wording changes.
Prefer 2–5 micro_segments per processing batch when appropriate.
If the batch is very uniform, 1 micro_segment is acceptable.
If the batch contains clear shifts, create multiple micro_segments.

━━━━━━━━━━━━━━━━━━
## STRICT RULES
━━━━━━━━━━━━━━━━━━
- Do NOT add new facts.
- Do NOT hallucinate.
- Do NOT invent visuals unless clearly grounded.
- Do NOT create final chapters.
- Do NOT assume the batch boundary is a chapter boundary.
- Preserve meaning, nuance, entities, events, and emotional flow.
- Use evidence line IDs wherever possible.

━━━━━━━━━━━━━━━━━━
## OUTPUT FORMAT
━━━━━━━━━━━━━━━━━━
Return ONLY valid JSON.
Do not wrap in markdown code block.
Do not add explanation.
Do not add comments.

Schema:

{
  "processing_chunk_id": string,
  "line_start": number,
  "line_end": number,
  "overall_summary": string,
  "micro_segments": [
    {
      "segment_id": string,
      "line_start": number,
      "line_end": number,
      "summary": string,
      "key_points": [
        {
          "text": string,
          "evidence_ids": [number]
        }
      ],
      "events": [
        {
          "text": string,
          "evidence_ids": [number]
        }
      ],
      "entities": [
        {
          "name": string,
          "type": string,
          "evidence_ids": [number],
          "confidence": number
        }
      ],
      "narrative_role": string,
      "emotion": [string],
      "topic": string,
      "chapter_boundary_signal": {
        "before_segment": string,
        "after_segment": string,
        "reason": string
      },
      "visual_cues": [
        {
          "text": string,
          "source": "explicit" | "inferred"
        }
      ],
      "confidence": number
    }
  ],
  "continuity_notes": {
    "starts_mid_context": boolean,
    "ends_mid_context": boolean,
    "notes": string
  },
  "quality": {
    "ambiguous_points": [string],
    "confidence": number
  }
}

━━━━━━━━━━━━━━━━━━
## STYLE
━━━━━━━━━━━━━━━━━━
- Write all text values in Japanese.
- Keep wording concise and precise.
- Use structured data over long prose.

━━━━━━━━━━━━━━━━━━
## DATA TO PROCESS
━━━━━━━━━━━━━━━━━━

Previous Context:
${previousContext || 'None'}

Transcript:
${transcript}
`;
