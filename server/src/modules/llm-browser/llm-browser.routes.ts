import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { isAppError } from '../../shared/http/errors.js';
import { chromeProfilesService } from '../chrome-profiles/chrome-profiles.service.js';
import { runWithFlowRetries } from './flow-retry.js';
import { metaBrowserService } from './meta-browser.service.js';
import {
  llmBrowserChatSchema,
  llmBrowserGenerateImageSchema,
  llmBrowserGenerateVideoSchema,
  llmBrowserOpenSchema,
  llmBrowserResponseSchema,
  llmBrowserSendSchema,
  llmBrowserSetupSchema,
} from './llm-browser.schema.js';
import { llmBrowserService } from './llm-browser.service.js';

export function createLlmBrowserRoutes() {
  const app = new Hono();

  app.post('/:profileId/open', zValidator('json', llmBrowserOpenSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await llmBrowserService.open(c.req.param('profileId'), body.provider);
    return c.json({ item });
  });

  app.post('/:profileId/setup', zValidator('json', llmBrowserSetupSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await llmBrowserService.setup(c.req.param('profileId'), body.provider, body.config);
    return c.json({ item });
  });

  app.post('/:profileId/send', zValidator('json', llmBrowserSendSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await llmBrowserService.send(c.req.param('profileId'), body.provider, body.prompt);
    return c.json({ item });
  });

  app.post('/:profileId/response', zValidator('json', llmBrowserResponseSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await llmBrowserService.getResponse(c.req.param('profileId'), body.provider, {
      timeoutMs: body.timeoutMs,
      stableMs: body.stableMs,
    });
    return c.json({ item });
  });

  app.post('/:profileId/chat', zValidator('json', llmBrowserChatSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await llmBrowserService.chat(
      c.req.param('profileId'),
      body.provider,
      body.prompt,
      body.config,
      {
        timeoutMs: body.timeoutMs,
        stableMs: body.stableMs,
      },
    );
    return c.json({ item });
  });

  app.post('/:profileId/generate-image', zValidator('json', llmBrowserGenerateImageSchema), async (c) => {
    const body = c.req.valid('json');
    const profileId = c.req.param('profileId');

    if (body.provider === 'meta') {
      const item = await metaBrowserService.generateMedia(profileId, body.prompt, {
        mediaKind: 'image',
        outputPath: body.outputPath,
        outputDir: body.outputDir,
        fileName: body.fileName,
        debugScreenshotPath: body.debugScreenshotPath,
        timeoutMs: body.timeoutMs,
        stableMs: body.stableMs,
      });
      return c.json({ item });
    }

    const profile = chromeProfilesService.getById(profileId);
    const { response: item } = await runWithFlowRetries({
      profileId,
      profileName: profile.name,
      prompt: body.prompt,
      logPrefix: '[llm-browser] generate-image',
      failureCode: 'FLOW_IMAGE_FAILED',
      generateOptions: {
        outputPath: body.outputPath,
        outputDir: body.outputDir,
        fileName: body.fileName,
        debugScreenshotPath: body.debugScreenshotPath,
        stableMs: body.stableMs,
        generationMode: body.generationMode,
        referenceImagePaths:
          body.referenceImagePaths?.length
            ? body.referenceImagePaths
            : body.referenceImagePath
              ? [body.referenceImagePath]
              : undefined,
        projectId: body.projectId,
      },
    });
    return c.json({ item });
  });

  app.post('/:profileId/generate-video', zValidator('json', llmBrowserGenerateVideoSchema), async (c) => {
    const body = c.req.valid('json');
    const item = await metaBrowserService.generateMedia(c.req.param('profileId'), body.prompt, {
      mediaKind: 'video',
      outputPath: body.outputPath,
      outputDir: body.outputDir,
      fileName: body.fileName,
      debugScreenshotPath: body.debugScreenshotPath,
      timeoutMs: body.timeoutMs,
      stableMs: body.stableMs,
    });
    return c.json({ item });
  });

  app.onError((err, c) => {
    if (isAppError(err)) {
      return c.json({ error: err.message, code: err.code }, err.statusCode as 400);
    }
    return c.json({ error: 'Internal server error' }, 500);
  });

  return app;
}
