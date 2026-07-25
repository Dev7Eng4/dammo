export const prompt = scene => `
You are given two inputs.

--------------------------------------------------
STYLE
--------------------------------------------------

A modern colorful outline illustration.

Style requirements:

• Flat vector illustration
• Thick black outline
• Uniform stroke width
• Rounded line caps
• Rounded corners
• Simple geometric construction
• Friendly proportions
• Minimal detail
• Bright flat colors
• Very subtle soft gradients
• No realistic lighting
• No realistic materials
• No texture
• No shadows
• Centered composition
• Transparent background
• No border
• No text
• No labels
• No watermark
• No logo
• Isolated illustration
• Consistent with premium illustration libraries such as Flaticon, Icons8, Streamline Color and Freepik.

--------------------------------------------------
SCENE
--------------------------------------------------

${scene}

--------------------------------------------------
TASK
--------------------------------------------------

Generate ONE final image generation prompt.

The output should naturally combine the illustration style with the provided scene.

Do not change the scene.

Do not add new objects.

Do not remove important objects.

The prompt should be optimized for AI image generation models.

Return ONLY the final prompt.
`;
