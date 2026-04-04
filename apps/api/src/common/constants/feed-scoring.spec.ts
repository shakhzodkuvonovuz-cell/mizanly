import {
  CANDIDATE_POOL_SIZE,
  FEED_CACHE_TTL,
  DECAY_FORMULAS,
  TIME_WINDOWS,
  ENGAGEMENT_WEIGHTS,
} from './feed-scoring';

describe('Feed Scoring Constants', () => {
  describe('CANDIDATE_POOL_SIZE', () => {
    it('should have MAIN_FEED at 500', () => {
      expect(CANDIDATE_POOL_SIZE.MAIN_FEED).toBe(500);
    });

    it('should have COMMUNITY at 100', () => {
      expect(CANDIDATE_POOL_SIZE.COMMUNITY).toBe(100);
    });

    it('should have PERSONALIZED at 500', () => {
      expect(CANDIDATE_POOL_SIZE.PERSONALIZED).toBe(500);
    });

    it('should have all positive values', () => {
      for (const key of Object.keys(CANDIDATE_POOL_SIZE) as Array<keyof typeof CANDIDATE_POOL_SIZE>) {
        expect(CANDIDATE_POOL_SIZE[key]).toBeGreaterThan(0);
      }
    });
  });

  describe('FEED_CACHE_TTL', () => {
    it('should have FORYOU at 60 seconds', () => {
      expect(FEED_CACHE_TTL.FORYOU).toBe(60);
    });

    it('should have TRENDING at 60 seconds', () => {
      expect(FEED_CACHE_TTL.TRENDING).toBe(60);
    });

    it('should have TRENDING_HASHTAGS at 300 seconds', () => {
      expect(FEED_CACHE_TTL.TRENDING_HASHTAGS).toBe(300);
    });

    it('should have REEL_FEED at 30 seconds', () => {
      expect(FEED_CACHE_TTL.REEL_FEED).toBe(30);
    });

    it('should have all positive values', () => {
      for (const key of Object.keys(FEED_CACHE_TTL) as Array<keyof typeof FEED_CACHE_TTL>) {
        expect(FEED_CACHE_TTL[key]).toBeGreaterThan(0);
      }
    });
  });

  describe('DECAY_FORMULAS', () => {
    it('should define 6 decay formulas', () => {
      expect(Object.keys(DECAY_FORMULAS)).toHaveLength(6);
    });

    it('should have POST_FORYOU with exponent 1.5 (aggressive)', () => {
      expect(DECAY_FORMULAS.POST_FORYOU.exponent).toBe(1.5);
    });

    it('should have REEL_FORYOU with exponent 1.2 (moderate)', () => {
      expect(DECAY_FORMULAS.REEL_FORYOU.exponent).toBe(1.2);
    });

    it('should have TRENDING_REEL with exponent 1.0 (linear)', () => {
      expect(DECAY_FORMULAS.TRENDING_REEL.exponent).toBe(1.0);
    });

    it('should have THREAD_FORYOU with exponent 1.5 (same as posts)', () => {
      expect(DECAY_FORMULAS.THREAD_FORYOU.exponent).toBe(1.5);
    });

    it('should have non-empty rationale for every formula', () => {
      for (const key of Object.keys(DECAY_FORMULAS) as Array<keyof typeof DECAY_FORMULAS>) {
        expect(DECAY_FORMULAS[key].rationale.length).toBeGreaterThan(0);
      }
    });

    it('should have all exponents between 1.0 and 2.0', () => {
      for (const key of Object.keys(DECAY_FORMULAS) as Array<keyof typeof DECAY_FORMULAS>) {
        expect(DECAY_FORMULAS[key].exponent).toBeGreaterThanOrEqual(1.0);
        expect(DECAY_FORMULAS[key].exponent).toBeLessThanOrEqual(2.0);
      }
    });
  });

  describe('TIME_WINDOWS', () => {
    it('should have FORYOU_HOURS at 48', () => {
      expect(TIME_WINDOWS.FORYOU_HOURS).toBe(48);
    });

    it('should have TRENDING_HOURS at 24', () => {
      expect(TIME_WINDOWS.TRENDING_HOURS).toBe(24);
    });

    it('should have FALLBACK_HOURS at 168 (7 days)', () => {
      expect(TIME_WINDOWS.FALLBACK_HOURS).toBe(168);
    });

    it('should have EXPLORATION_FRESH_HOURS at 6', () => {
      expect(TIME_WINDOWS.EXPLORATION_FRESH_HOURS).toBe(6);
    });

    it('should enforce tier ordering: trending < foryou < fallback', () => {
      expect(TIME_WINDOWS.TRENDING_HOURS).toBeLessThan(TIME_WINDOWS.FORYOU_HOURS);
      expect(TIME_WINDOWS.FORYOU_HOURS).toBeLessThan(TIME_WINDOWS.FALLBACK_HOURS);
    });

    it('should have exploration percentage at 15%', () => {
      expect(TIME_WINDOWS.EXPLORATION_SLOT_PERCENTAGE).toBe(15);
    });
  });

  describe('ENGAGEMENT_WEIGHTS', () => {
    it('should define weights for all 7 feed types', () => {
      expect(Object.keys(ENGAGEMENT_WEIGHTS)).toHaveLength(7);
    });

    it('POST_FORYOU: shares > comments > likes > saves > views', () => {
      const w = ENGAGEMENT_WEIGHTS.POST_FORYOU;
      expect(w.shares).toBeGreaterThan(w.comments);
      expect(w.comments).toBeGreaterThan(w.likes);
      expect(w.likes).toBeGreaterThan(w.saves);
      expect(w.saves).toBeGreaterThan(w.views);
    });

    it('REEL_FORYOU: shares > comments > likes > views', () => {
      const w = ENGAGEMENT_WEIGHTS.REEL_FORYOU;
      expect(w.shares).toBeGreaterThan(w.comments);
      expect(w.comments).toBeGreaterThan(w.likes);
      expect(w.likes).toBeGreaterThan(w.views);
    });

    it('THREAD_FORYOU: replies > reposts > likes (threads are conversation-driven)', () => {
      const w = ENGAGEMENT_WEIGHTS.THREAD_FORYOU;
      expect(w.replies).toBeGreaterThan(w.reposts);
      expect(w.reposts).toBeGreaterThan(w.likes);
    });

    it('PERSONALIZED_FEED: weights should sum to 1.0', () => {
      const w = ENGAGEMENT_WEIGHTS.PERSONALIZED_FEED;
      const sum = w.similarity + w.engagement + w.recency + w.islamic + w.session;
      expect(sum).toBeCloseTo(1.0, 10);
    });

    it('PERSONALIZED_FEED: similarity should be highest weight', () => {
      const w = ENGAGEMENT_WEIGHTS.PERSONALIZED_FEED;
      expect(w.similarity).toBeGreaterThan(w.engagement);
      expect(w.similarity).toBeGreaterThan(w.recency);
      expect(w.similarity).toBeGreaterThan(w.islamic);
      expect(w.similarity).toBeGreaterThan(w.session);
    });

    it('should have all non-negative weights', () => {
      const checkWeights = (obj: Record<string, number>) => {
        for (const val of Object.values(obj)) {
          expect(val).toBeGreaterThanOrEqual(0);
        }
      };
      checkWeights(ENGAGEMENT_WEIGHTS.POST_FORYOU);
      checkWeights(ENGAGEMENT_WEIGHTS.REEL_FORYOU);
      checkWeights(ENGAGEMENT_WEIGHTS.TRENDING_REEL);
      checkWeights(ENGAGEMENT_WEIGHTS.THREAD_FORYOU);
      checkWeights(ENGAGEMENT_WEIGHTS.TRENDING_THREAD);
      checkWeights(ENGAGEMENT_WEIGHTS.COMMUNITY_TRENDING);
      checkWeights(ENGAGEMENT_WEIGHTS.PERSONALIZED_FEED);
    });
  });
});
