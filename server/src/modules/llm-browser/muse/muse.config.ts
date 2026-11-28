/**
 * Muse (https://muse.ai, Meta's personal agent) DOM selectors.
 *
 * Checked by hand on 2026-11-27:
 * - Every image goes to its own side chat: `/thread/new` becomes `/thread/<uuid>` once the first message is sent.
 * - The composer is a `<textarea aria-label="Message">` inside `[data-hatch-composer-chrome]`. Text typed before the
 *   page hydrates is dropped, and the Send button only shows once the hydrated composer holds text.
 * - While Muse works the Send button is replaced by `button[aria-label="Stop"]`.
 * - Messages are `[data-message-item]` with `data-message-role="user" | "assistant"`.
 * - A generated image is `[data-testid="hatch-chat-attachment-presentation-image"]` in an assistant message. Its
 *   `<img>` is a ~500px blob preview; clicking `button[data-pel-click="chat_media_click"]` opens the lightbox
 *   (`[role="dialog"][data-hatch-media-lightbox]`), whose largest `<img>` is the full image (2048x1152 webp) as a blob.
 * - Reference images go through the composer's hidden `input[type=file][multiple]`; each shows as an `<img>` in the
 *   composer with a "Remove attachment" button. They are uploaded only when the message is sent.
 * - When the image tool fails Muse answers in text only ("the image generator ran into an unexpected error").
 *   Sometimes it asks for confirmation before creating an image instead of creating it.
 */
export const MUSE_BASE_URL = 'https://muse.ai/';
export const MUSE_NEW_THREAD_URL = 'https://muse.ai/thread/new';

/** Whole budget for one image, from submit to the full-size image in the lightbox. */
export const MUSE_IMAGE_TIMEOUT_MS = 240_000;
/** Whole budget for one video, from submit to the MP4 in the chat. */
export const MUSE_VIDEO_TIMEOUT_MS = 480_000;

/**
 * Video length Muse can make, in seconds. The length goes in the prompt ("Create video 16:9 5s: …");
 * without it Muse makes 10s. Checked 2026-11-27: "4s" gave a 4s clip, no length gave 10s.
 */
export const MUSE_VIDEO_MIN_SECONDS = 3;
export const MUSE_VIDEO_MAX_SECONDS = 10;
export const MUSE_VIDEO_DEFAULT_SECONDS = 8;

export const MUSE_SELECTORS = {
  composer: '[data-hatch-composer-chrome]',
  /** Landing page shown instead of the chat when the profile is logged out. */
  signInForm: 'input[placeholder="Mobile number or email"]',
  promptInput: '[data-hatch-composer-chrome] textarea[aria-label="Message"]',
  fileInput: '[data-hatch-composer-chrome] input[type="file"]',
  attachmentPreview: '[data-hatch-composer-chrome] img',
  removeAttachmentButton: '[data-hatch-composer-chrome] button[aria-label="Remove attachment"]',
  sendButton: '[data-hatch-composer-chrome] button[aria-label="Send"]',
  stopButton: '[data-hatch-composer-chrome] button[aria-label="Stop"]',
  messageItem: '[data-message-item]',
  userMessage: '[data-message-item][data-message-role="user"]',
  assistantMessage: '[data-message-item][data-message-role="assistant"]',
  generatedImage: '[data-message-item][data-message-role="assistant"] [data-testid="hatch-chat-attachment-presentation-image"]',
  openImageButton: 'button[data-pel-click="chat_media_click"]',
  /**
   * A finished video: the presentation holds `<video src="blob:…">` (1280x720 MP4, the whole file, no lightbox
   * needed); its wrapper repeats the URL in `data-hatch-video-src`.
   */
  generatedVideo: '[data-message-item][data-message-role="assistant"] [data-testid="hatch-chat-attachment-presentation-video"]',
  lightbox: '[role="dialog"][data-hatch-media-lightbox]',
  lightboxCloseButton: 'button[aria-label="Close"]',
} as const;

/**
 * Muse answered in text that it could not make the image or video, e.g. "the video service is temporarily
 * unavailable right now (503), so it didn't make the 5-second clip".
 */
export const MUSE_IMAGE_ERROR_PATTERN =
  /(ran into|hit|had) (an? )?(unexpected |internal )?(error|problem)|failed|couldn'?t|could not|can'?t (run|create|make)|unable to|unavailable|\b5\d\d\b|didn'?t (make|produce|create)|không (thể|tạo được)|lỗi/i;

/** The failure is Muse's video/image service being down: an immediate retry will not get past it. */
export const MUSE_SERVICE_DOWN_PATTERN = /unavailable|\b50[234]\b|didn'?t respond|come back (to|in)|in a little while/i;

/** Muse asked before creating the image instead of creating it. */
export const MUSE_CONFIRM_QUESTION_PATTERN =
  /(should i|shall i|want me to|would you like me to|do you want|ready for me to|go ahead|confirm|có muốn|mình tạo luôn|tạo luôn nhé|bạn xác nhận)/i;

export const MUSE_CONFIRM_REPLY = 'Yes, please create the image now exactly as described.';
