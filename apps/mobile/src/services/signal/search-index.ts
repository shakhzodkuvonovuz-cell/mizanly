/**
 * Client-side search index for encrypted messages.
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

import { MMKV } from 'react-native-mmkv';
import type { SearchIndexEntry } from './types';

// ============================================================
// CONSTANTS
// ============================================================

/** Maximum indexed messages (LRU eviction beyond this) */
const MAX_INDEXED_MESSAGES = 50_000;

/** Minimum token length to index (skip 1-2 char tokens) */
const MIN_TOKEN_LENGTH = 3;

/** MMKV key prefixes */
const INDEX_TOKEN_PREFIX = 'searchidx:t:';
const INDEX_MSG_PREFIX = 'searchidx:m:';
const INDEX_COUNT_KEY = 'searchidx:__count';

let mmkvInstance: MMKV | null = null;
let mmkvInitPromise: Promise<MMKV> | null = null;

async function getMMKV(): Promise<MMKV> {
  if (mmkvInstance) return mmkvInstance;
  if (!mmkvInitPromise) {
    mmkvInitPromise = (async () => {
      const SecureStore = await import('expo-secure-store');
      const encKey = await SecureStore.getItemAsync('e2e_mmkv_key');
      // CRITICAL: NEVER create unencrypted MMKV for search index.
      // Without encryption, tokenized message content is stored in cleartext on disk.
      if (!encKey) {
        throw new Error(
          'E2E encryption key not available. Call SignalService.initialize() before using search index.',
        );
      }
      mmkvInstance = new MMKV({ id: 'mizanly-signal-search', encryptionKey: encKey });
      return mmkvInstance;
    })();
  }
  return mmkvInitPromise;
}

// ============================================================
// INDEXING
// ============================================================

/**
 * Index a decrypted message for search.
 * Called after every successful decrypt.
 *
 * @param messageId - Message ID
 * @param conversationId - Conversation ID
 * @param content - Decrypted plaintext content
 * @param timestamp - Message creation timestamp
 */
export async function indexMessage(
  messageId: string,
  conversationId: string,
  content: string,
  timestamp: number,
): Promise<void> {
  if (!content || content.trim().length === 0) return;

  const mmkv = await getMMKV();
  const tokens = tokenize(content);
  if (tokens.length === 0) return;

  // Store message metadata (for result construction)
  const msgKey = `${INDEX_MSG_PREFIX}${messageId}`;
  mmkv.set(msgKey, JSON.stringify({ conversationId, timestamp }));

  // Add messageId to each token's posting list
  for (const token of tokens) {
    const tokenKey = `${INDEX_TOKEN_PREFIX}${token}`;
    const existing = mmkv.getString(tokenKey);
    const postings: string[] = existing ? JSON.parse(existing) : [];

    if (!postings.includes(messageId)) {
      postings.push(messageId);
      // Cap per-token posting list to prevent one common word from bloating
      if (postings.length > 5000) postings.shift();
      mmkv.set(tokenKey, JSON.stringify(postings));
    }
  }

  // Track count for LRU
  const count = (mmkv.getNumber(INDEX_COUNT_KEY) ?? 0) + 1;
  mmkv.set(INDEX_COUNT_KEY, count);

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
  const mmkv = await getMMKV();
  const msgKey = `${INDEX_MSG_PREFIX}${messageId}`;
  mmkv.delete(msgKey);

  // We don't clean up token posting lists (too expensive).
  // Stale messageIds in posting lists are filtered during search.
  const count = mmkv.getNumber(INDEX_COUNT_KEY) ?? 0;
  mmkv.set(INDEX_COUNT_KEY, Math.max(0, count - 1));
}

// ============================================================
// SEARCH
// ============================================================

/**
 * Search for messages matching a query.
 *
 * Tokenizes the query and finds messages that contain ALL tokens
 * (AND semantics). Returns results sorted by timestamp (newest first).
 *
 * @param query - Search query string
 * @param limit - Maximum results (default 50)
 * @returns Matching messages with conversationId and timestamp
 */
export async function searchMessages(
  query: string,
  limit: number = 50,
): Promise<SearchIndexEntry[]> {
  if (!query || query.trim().length === 0) return [];

  const mmkv = await getMMKV();
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  // Get posting lists for all query tokens
  let candidateIds: Set<string> | null = null;

  for (const token of tokens) {
    const tokenKey = `${INDEX_TOKEN_PREFIX}${token}`;
    const existing = mmkv.getString(tokenKey);
    if (!existing) return []; // Token not in index → no results (AND semantics)

    const postings: string[] = JSON.parse(existing);
    const postingSet = new Set(postings);

    if (candidateIds === null) {
      candidateIds = postingSet;
    } else {
      // Intersect with previous candidates (AND)
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
    const msgKey = `${INDEX_MSG_PREFIX}${messageId}`;
    const metaStr = mmkv.getString(msgKey);
    if (!metaStr) continue; // Stale entry — message was deleted

    const meta: { conversationId: string; timestamp: number } = JSON.parse(metaStr);
    results.push({
      messageId,
      conversationId: meta.conversationId,
      timestamp: meta.timestamp,
    });
  }

  // Sort newest first
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
  const all = await searchMessages(query, limit * 2); // Over-fetch to filter
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
  // Split on whitespace + common punctuation
  const raw = normalized.split(/[\s.,!?;:()[\]{}'"،؟!]+/);
  // Filter empty and too-short tokens, deduplicate
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
  const allMsgKeys = mmkv.getAllKeys().filter((k) => k.startsWith(INDEX_MSG_PREFIX));

  // Collect with timestamps
  const entries: Array<{ key: string; messageId: string; timestamp: number }> = [];
  for (const key of allMsgKeys) {
    const str = mmkv.getString(key);
    if (!str) { mmkv.delete(key); continue; }
    try {
      const meta = JSON.parse(str);
      entries.push({
        key,
        messageId: key.replace(INDEX_MSG_PREFIX, ''),
        timestamp: meta.timestamp ?? 0,
      });
    } catch {
      mmkv.delete(key);
    }
  }

  // Sort oldest first
  entries.sort((a, b) => a.timestamp - b.timestamp);
  const toEvict = entries.slice(0, count);

  for (const entry of toEvict) {
    mmkv.delete(entry.key);
  }

  const globalCount = mmkv.getNumber(INDEX_COUNT_KEY) ?? 0;
  mmkv.set(INDEX_COUNT_KEY, Math.max(0, globalCount - toEvict.length));
}

/**
 * Clear the entire search index.
 * Called on logout / account deletion.
 */
export async function clearSearchIndex(): Promise<void> {
  const mmkv = await getMMKV();
  mmkv.clearAll();
  mmkvInstance = null;
  mmkvInitPromise = null;
}

/**
 * Get index statistics.
 */
export async function getSearchIndexStats(): Promise<{
  indexedMessages: number;
  uniqueTokens: number;
}> {
  const mmkv = await getMMKV();
  const indexedMessages = mmkv.getNumber(INDEX_COUNT_KEY) ?? 0;
  const tokenKeys = mmkv.getAllKeys().filter((k) => k.startsWith(INDEX_TOKEN_PREFIX));
  return { indexedMessages, uniqueTokens: tokenKeys.length };
}
