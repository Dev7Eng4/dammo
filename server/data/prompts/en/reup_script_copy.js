export default (chapterSceneInput) => `The goal is to create enough scenes so the video has normal visual pacing.
A long chapter with many narrative beats should produce more scenes.
A short chapter with one emotional beat may produce only one scene.

━━━━━━━━━━━━━━━━━━
## INPUT
━━━━━━━━━━━━━━━━━━
Chapter Scene Input JSON:
${JSON.stringify(chapterSceneInput, null, 2)}

━━━━━━━━━━━━━━━━━━
## CRITICAL LINE RANGE RULES
━━━━━━━━━━━━━━━━━━
- Every scene MUST include line_start and line_end.
- line_start and line_end MUST be inside current_chapter.line_start and current_chapter.line_end.`;
