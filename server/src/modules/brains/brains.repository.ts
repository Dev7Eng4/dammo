import path from 'node:path';
import { paths } from '../../config/paths.js';
import { readJson, writeJson } from '../../infrastructure/storage/json-store.js';
import { BRAIN_DEFINITIONS } from './brains.registry.js';
import type { BrainState, BrainsStore } from './brains.types.js';

const STORE_FILE = path.join(paths.dataDir, 'brains.json');
const MAX_PULSES = 2000;
const MAX_NEURONS_PER_BRAIN = 600;

function defaultState(id: string, active: boolean): BrainState {
  return {
    id,
    status: active ? 'idle' : 'dormant',
    autoIntervalHours: 0,
    runs: 0,
    usage: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 },
  };
}

class BrainsRepository {
  private cache: BrainsStore | null = null;

  read(): BrainsStore {
    if (!this.cache) {
      const store = readJson<BrainsStore>(STORE_FILE) ?? { brains: {}, neurons: [], pulses: [] };
      for (const def of BRAIN_DEFINITIONS) {
        const existing = store.brains[def.id];
        if (!existing) store.brains[def.id] = defaultState(def.id, def.active);
        else if (!def.active) existing.status = 'dormant';
        else if (existing.status === 'dormant') existing.status = 'idle';
      }
      this.cache = store;
    }
    return this.cache;
  }

  write(store: BrainsStore): void {
    if (store.pulses.length > MAX_PULSES) store.pulses = store.pulses.slice(-MAX_PULSES);
    // Keep each brain's memory bounded: drop the coldest, oldest neurons first.
    const byBrain = new Map<string, number>();
    for (const neuron of store.neurons) byBrain.set(neuron.brainId, (byBrain.get(neuron.brainId) ?? 0) + 1);
    if ([...byBrain.values()].some(count => count > MAX_NEURONS_PER_BRAIN)) {
      const sorted = [...store.neurons].sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt) || b.heat - a.heat);
      const kept = new Map<string, number>();
      store.neurons = sorted.filter(neuron => {
        const count = kept.get(neuron.brainId) ?? 0;
        kept.set(neuron.brainId, count + 1);
        return count < MAX_NEURONS_PER_BRAIN;
      });
    }
    this.cache = store;
    writeJson(STORE_FILE, store);
  }

  update(mutator: (store: BrainsStore) => void): BrainsStore {
    const store = this.read();
    mutator(store);
    this.write(store);
    return store;
  }
}

export const brainsRepository = new BrainsRepository();
