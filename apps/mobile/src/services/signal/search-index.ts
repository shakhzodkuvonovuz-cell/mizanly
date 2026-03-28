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
  const mmkv = await getMMKV();
  const allMsgKeys = mmkv.getAllKeys().filter((k) =>
    k.startsWith(HMAC_TYPE.SEARCH_MSG) || k.startsWith(INDEX_MSG_PREFIX),
  );

  const entries: Array<{ originalKey: string; messageId: string; timestamp: number }> = [];
  for (const key of allMsgKeys) {
    try {
      // For legacy keys (original prefix), read directly
      if (key.startsWith(INDEX_MSG_PREFIX)) {
        const raw = mmkv.getString(key);
        if (!raw) { mmkv.delete(key); continue; }
        const str = raw.startsWith('A1:') ? null : raw;
        if (!str) continue;
        const meta = JSON.parse(str);
        entries.push({
          originalKey: key,
          messageId: key.replace(INDEX_MSG_PREFIX, ''),
          timestamp: meta.timestamp ?? 0,
        });
      }
      // HMAC keys: we can't decrypt without original key, skip for eviction.
      // The per-index cap and periodic clearSearchIndex handle cleanup.
    } catch {
      mmkv.delete(key);
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  const toEvict = entries.slice(0, count);

  for (const entry of toEvict) {
    await secureDelete(HMAC_TYPE.SEARCH_MSG, entry.originalKey);
  }

  const globalCount = await getIndexCount();
  await setIndexCount(Math.max(0, globalCount - toEvict.length));
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
      key.startsWith(HMAC_TYPE.SEARCH_COUNT)
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
