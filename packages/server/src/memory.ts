
import { systemState, addSystemError } from './state/state_manager.js';

let memoryStore = {
    // ... initial memory store state
};

export function getMemoryStore() {
    return memoryStore;
}

export function updateMemoryStore(updates: any) {
    memoryStore = { ...memoryStore, ...updates };
}
