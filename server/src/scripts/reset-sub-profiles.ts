import { ensureDataDirs } from '../config/paths.js';
import { chromeProfilesService } from '../modules/chrome-profiles/chrome-profiles.service.js';

async function main() {
  ensureDataDirs();

  console.log('Resetting sub Chrome profiles...');
  const result = await chromeProfilesService.resetSubProfiles();

  if (result.deletedCount > 0) {
    console.log(`Removed ${result.deletedCount} sub profile(s).`);
  } else {
    console.log('No sub profiles to remove.');
  }

  console.log(`Created ${result.items.length} sub profile(s):`);
  for (const profile of result.items) {
    console.log(`  - ${profile.name} (${profile.id})`);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
