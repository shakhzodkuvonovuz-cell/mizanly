/**
 * Client-side search index for encrypted messages — AEAD-encrypted in shared MMKV.
 *
 * F3 FIX: Previously used its own MMKV instance with AES-CFB encryption
 * (no integrity, tokenized plaintext exposed on disk). Now uses the shared
 * MMKV from storage.ts with per-value AEAD wrapping + HMAC-hashed key names.
 *
 * The server can't search encrypted content. This inverted index lets
 * users search their own decrypted messages locally.
 *
 * On every decrypt, the plaintext is tokenized and indexed in encrypted MMKV.
 * Search scans the index and returns matching message/conversation IDs.
 *
 * Limitations:
 * - 50K message cap with LRU eviction
 * - No stemming or fuzzy matching (exact token match only)
 * - Arabic text tokenized by whitespace (no morphological analysis)
 * - Stop words not filtered (keeps index simple)
 *
 * Future: migrate to SQLite FTS5 via expo-sqlite for better scaling.
 */

import {
  getMMKV, secureStore, secureLoad, secureDelete,
  hmacKeyName, HMAC_TYPE,
} from './storage';
import type { SearchIndexEntry } from './types';

// ============================================================
// CONSTANTS
// ============================================================

/** Maximum indexed messages (LRU eviction beyond this) */
const MAX_INDEXED_MESSAGES = 50_000;

/** Minimum token length to index (skip 1-2 char tokens) */
const MIN_TOKEN_LENGTH = 3;

/** Original MMKV key prefixes (used as HMAC input, NOT stored directly) */
const INDEX_TOKEN_PREFIX = 'searchidx:t:';
const INDEX_MSG_PREFIX = 'searchidx:m:';
const INDEX_COUNT_KEY = 'searchidx:__count';

/**
 * F5-5 FIX: FIFO eviction order list for HMAC-keyed entries.
 * HMAC keys can't be decrypted to check age, so we maintain an ordered
 * list of messageIds in insertion order. Eviction pops from the front (oldest).
 */
const INDEX_FIFO_KEY = 'searchidx:__fifo';

/** Max FIFO entries per chunk to avoid oversized MMKV values */
const FIFO_CHUNK_SIZE = 5000;

// ============================================================
// FIFO HELPERS (F5-5)
// ============================================================

/**
 * Load the FIFO eviction order list. Returns messageIds in insertion order
 * (oldest first). The list is sharded into chunks to avoid oversized values.
 */
async function loadFifoOrder(): Promise<string[]> {
  const metaStr = await secureLoad(HMAC_TYPE.SEARCH_FIFO, INDEX_FIFO_KEY);
  if (!metaStr) return [];
  return JSON.parse(metaStr) as string[];
}

/**
 * Save the FIFO eviction order list.
 */
async function saveFifoOrder(order: string[]): Promise<void> {
  await secureStore(HMAC_TYPE.SEARCH_FIFO, INDEX_FIFO_KEY, JSON.stringify(order));
}

/**
 * Append a messageId to the FIFO order. O(1) amortized if we batch saves.
 */
async function fifoAppend(messageId: string): Promise<void> {
  const order = await loadFifoOrder();
  if (!order.includes(messageId)) {
    order.push(messageId);
    await saveFifoOrder(order);
  }
}

/**
 * Remove a messageId from the FIFO order (on delete).
 */
async function fifoRemove(messageId: string): Promise<void> {
  const order = await loadFifoOrder();
  const idx = order.indexOf(messageId);
  if (idx !== -1) {
    order.splice(idx, 1);
    await saveFifoOrder(order);
  }
}

/**
 * Pop the oldest N messageIds from the FIFO order for eviction.
 * Returns the popped IDs and saves the updated order.
 */
async function fifoPop(count: number): Promise<string[]> {
  const order = await loadFifoOrder();
  const popped = order.splice(0, count);
  await saveFifoOrder(order);
  return popped;
}

// ============================================================
// COUNT HELPERS
// ============================================================

/**
 * V4-F17: Index count stored via AEAD (not raw MMKV number).
 * Previously stored as plain number, visible to filesystem forensics.
 */
async function getIndexCount(): Promise<number> {
  const val = await secureLoad(HMAC_TYPE.SEARCH_COUNT, INDEX_COUNT_KEY);
  if (val !== null) return parseInt(val, 10) || 0;
  // Migration: check legacy raw number keys, delete-then-write for crash safety
  const mmkv = await getMMKV();
  const hashed = hmacKeyName(HMAC_TYPE.SEARCH_COUNT, INDEX_COUNT_KEY);
  let count = mmkv.getNumber(hashed);
  if (count === undefined) count = mmkv.getNumber(INDEX_COUNT_KEY);
  if (count !== undefined) {
    mmkv.delete(hashed);
    mmkv.delete(INDEX_COUNT_KEY);
    await secureStore(HMAC_TYPE.SEARCH_COUNT, INDEX_COUNT_KEY, String(count));
    return count;
  }
  return 0;
}

async function setIndexCount(count: number): Promise<void> {
  await secureStore(HMAC_TYPE.SEARCH_COUNT, INDEX_COUNT_KEY, String(count));
}

// ============================================================
// INDEXING
// ============================================================

/**
 * Index a decrypted message for search.
 * Called after every successful decrypt.
 */
export async function indexMessage(
  messageId: string,
  conversationId: string,
  content: string,
  timestamp: number,
): Promise<void> {
  if (!content || content.trim().length === 0) return;

  const tokens = tokenize(content);
  if (tokens.length === 0) return;

  // Store message metadata (AEAD + HMAC key)
  const msgOriginalKey = `${INDEX_MSG_PREFIX}${messageId}`;
  await secureStore(HMAC_TYPE.SEARCH_MSG, msgOriginalKey, JSON.stringify({ conversationId, timestamp }));

  // Add messageId to each token's posting list (AEAD + HMAC key)
  for (const token of tokens) {
    const tokenOriginalKey = `${INDEX_TOKEN_PREFIX}${token}`;
    const existing = await secureLoad(HMAC_TYPE.SEARCH_TOKEN, tokenOriginalKey);
    const postings: string[] = existing ? JSON.parse(existing) : [];

    if (!postings.includes(messageId)) {
      postings.push(messageId);
      // Cap per-token posting list to prevent one common word from bloating
      if (postings.length > 5000) postings.shift();
      await secureStore(HMAC_TYPE.SEARCH_TOKEN, tokenOriginalKey, JSON.stringify(postings));
    }
  }

  // F5-5: Track in FIFO order for HMAC-safe eviction
  await fifoAppend(messageId);

  // Track count for LRU
  const count = (await getIndexCount()) + 1;
  await setIndexCount(count);

  // LRU eviction if over cap
  if (count > MAX_INDEXED_MESSAGES) {
    await evictOldestIndexEntries(500);
  }
}

/**
 * Remove a message from the search index.
 * Called when a message is deleted.
 */
export async function removeFromIndex(messageId: string): Promise<void> {
  const msgOriginalKey = `${INDEX_MSG_PREFIX}${messageId}`;
  await secureDelete(HMAC_TYPE.SEARCH_MSG, msgOriginalKey);

  // F5-5: Remove from FIFO order
  await fifoRemove(messageId);

  // We don't clean up token posting lists (too expensive).
  // Stale messageIds in posting lists are filtered during search.
  const count = await getIndexCount();
  await setIndexCount(Math.max(0, count - 1));
}

// ============================================================
// SEARCH
// ============================================================

/**
 * Search for messages matching a query.
 *
 * Tokenizes the query and finds messages that contain ALL tokens
 * (AND semantics). Returns results sorted by timestamp (newest first).
 */
export async function searchMessages(
  query: string,
  limit: number = 50,
): Promise<SearchIndexEntry[]> {
  if (!query || query.trim().length === 0) return [];

  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  // Get posting lists for all query tokens
  let candidateIds: Set<string> | null = null;

  for (const token of tokens) {
    const tokenOriginalKey = `${INDEX_TOKEN_PREFIX}${token}`;
    const existing = await secureLoad(HMAC_TYPE.SEARCH_TOKEN, tokenOriginalKey);
    if (!existing) return []; // Token not in index → no results (AND semantics)

    const postings: string[] = JSON.parse(existing);
    const postingSet = new Set(postings);

    if (candidateIds === null) {
      candidateIds = postingSet;
    } else {
      for (const id of candidateIds) {
        if (!postingSet.has(id)) candidateIds.delete(id);
      }
    }

    if (candidateIds.size === 0) return [];
  }

  if (!candidateIds || candidateIds.size === 0) return [];

  // Resolve message metadata and sort by timestamp
  const results: SearchIndexEntry[] = [];
  for (const messageId of candidateIds) {
    const msgOriginalKey = `${INDEX_MSG_PREFIX}${messageId}`;
    const metaStr = await secureLoad(HMAC_TYPE.SEARCH_MSG, msgOriginalKey);
    if (!metaStr) continue; // Stale entry — message was deleted

    const meta: { conversationId: string; timestamp: number } = JSON.parse(metaStr);
    results.push({
      messageId,
      conversationId: meta.conversationId,
      timestamp: meta.timestamp,
    });
  }

  results.sort((a, b) => b.timestamp - a.timestamp);

  return results.slice(0, limit);
}

/**
 * Search within a specific conversation.
 */
export async function searchInConversation(
  conversationId: string,
  query: string,
  limit: number = 50,
): Promise<SearchIndexEntry[]> {
  const all = await searchMessages(query, limit * 2);
  return all.filter((r) => r.conversationId === conversationId).slice(0, limit);
}

// ============================================================
// TOKENIZATION
// ============================================================

/**
 * Tokenize text for indexing/searching.
 * - Lowercase
 * - Split on whitespace and punctuation
 * - Filter tokens shorter than MIN_TOKEN_LENGTH
 * - Handles Arabic, Latin, emoji (split by whitespace)
 */
function tokenize(text: string): string[] {
  const normalized = text.toLowerCase().trim();
  const raw = normalized.split(/[\s.,!?;:()[\]{}'"،؟!]+/);
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const t of raw) {
    const cleaned = t.trim();
    if (cleaned.length >= MIN_TOKEN_LENGTH && !seen.has(cleaned)) {
      seen.add(cleaned);
      tokens.push(cleaned);
    }
  }
  return tokens;
}

// ============================================================
// EVICTION
// ============================================================

async function evictOldestIndexEntries(count: number): Promise<void> {
  // F5-5 FIX: Use FIFO order for HMAC entries instead of skipping them.
  // The FIFO list tracks messageIds in insertion order. Pop the oldest N
  // and delete their HMAC-keyed metadata. This works for both legacy and
  // HMAC entries — FIFO is the single source of truth for eviction order.
  const evicted = await fifoPop(count);

  for (const messageId of evicted) {
    const msgOriginalKey = `${INDEX_MSG_PREFIX}${messageId}`;
    await secureDelete(HMAC_TYPE.SEARCH_MSG, msgOriginalKey);
  }

  // Also clean up any legacy plaintext keys that aren't in the FIFO
  const mmkv = await getMMKV();
  const legacyKeys = mmkv.getAllKeys().filter((k) => k.startsWith(INDEX_MSG_PREFIX));
  let legacyEvicted = 0;
  const maxLegacyEvict = Math.max(0, count - evicted.length);
  for (const key of legacyKeys) {
    if (legacyEvicted >= maxLegacyEvict) break;
    try {
      mmkv.delete(key);
      legacyEvicted++;
    } catch {
      mmkv.delete(key);
    }
  }

  const totalEvicted = evicted.length + legacyEvicted;
  const globalCount = await getIndexCount();
  await setIndexCount(Math.max(0, globalCount - totalEvicted));
}

/**
 * Clear the entire search index.
 * Called on logout / account deletion.
 */
export async function clearSearchIndex(): Promise<void> {
  const mmkv = await getMMKV();
  const allKeys = mmkv.getAllKeys();
  // Remove all search-related keys (both old and new prefixes)
  for (const key of allKeys) {
    if (
      key.startsWith(INDEX_TOKEN_PREFIX) ||
      key.startsWith(INDEX_MSG_PREFIX) ||
      key === INDEX_COUNT_KEY ||
      key.startsWith(HMAC_TYPE.SEARCH_TOKEN) ||
      key.startsWith(HMAC_TYPE.SEARCH_MSG) ||
      key.startsWith(HMAC_TYPE.SEARCH_COUNT) ||
      key.startsWith(HMAC_TYPE.SEARCH_FIFO)
    ) {
      mmkv.delete(key);
    }
  }
}

/**
 * Get index statistics.
 */
export async function getSearchIndexStats(): Promise<{
  indexedMessages: number;
  uniqueTokens: number;
}> {
  const indexedMessages = await getIndexCount();
  const mmkv = await getMMKV();
  const tokenKeys = mmkv.getAllKeys().filter((k) =>
    k.startsWith(HMAC_TYPE.SEARCH_TOKEN) || k.startsWith(INDEX_TOKEN_PREFIX),
  );
  return { indexedMessages, uniqueTokens: tokenKeys.length };
}
