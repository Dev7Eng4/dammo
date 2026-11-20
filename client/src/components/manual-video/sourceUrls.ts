/** YouTube video id from a watch / youtu.be / shorts link, or null. */
export function youtubeIdOf(url: string): string | null {
  const match = /(?:v=|youtu\.be\/|shorts\/|embed\/)([\w-]{11})/.exec(url)
  return match ? match[1] : null
}

/** Ids of the YouTube links in a free-text source box (one link per line or space-separated). */
export function sourceIdsOf(text: string): string[] {
  return text
    .split(/\s+/)
    .map((line) => youtubeIdOf(line.trim()))
    .filter((id): id is string => Boolean(id))
}
