import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

export async function writeYoutubeiStreamToFile(stream: ReadableStream<Uint8Array>, filePath: string): Promise<void> {
  const nodeStream = Readable.fromWeb(stream as Parameters<typeof Readable.fromWeb>[0]);
  await pipeline(nodeStream, createWriteStream(filePath));
}
