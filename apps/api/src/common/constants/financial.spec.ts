import {
  DIAMOND_TO_USD,
  DIAMONDS_PER_USD_CENT,
  MIN_CASHOUT_DIAMONDS,
  DIAMOND_RATE,
  PLATFORM_FEE_RATE,
  MIN_TIP_AMOUNT,
  MAX_TIP_AMOUNT,
  COIN_PRICE_RATE,
} from './financial';

describe('Financial Constants', () => {
  describe('DIAMOND_TO_USD', () => {
    it('should be $0.007 per diamond', () => {
      expect(DIAMOND_TO_USD).toBe(0.007);
    });

    it('100 diamonds should equal $0.70', () => {
      expect(100 * DIAMOND_TO_USD).toBeCloseTo(0.7, 10);
    });
  });

  describe('DIAMONDS_PER_USD_CENT', () => {
    it('should be 100/70 (~1.4286)', () => {
      expect(DIAMONDS_PER_USD_CENT).toBeCloseTo(100 / 70, 10);
    });

    it('should be consistent with DIAMOND_TO_USD', () => {
      // 1 cent = $0.01. At $0.007/diamond, that's 0.01/0.007 = ~1.4286 diamonds/cent
      const expectedFromUsd = 0.01 / DIAMOND_TO_USD;
      expect(DIAMONDS_PER_USD_CENT).toBeCloseTo(expectedFromUsd, 5);
    });
  });

  describe('MIN_CASHOUT_DIAMONDS', () => {
    it('should be 100 diamonds', () => {
      expect(MIN_CASHOUT_DIAMONDS).toBe(100);
    });

    it('minimum cashout value should be $0.70', () => {
      expect(MIN_CASHOUT_DIAMONDS * DIAMOND_TO_USD).toBeCloseTo(0.7, 10);
    });
  });

  describe('DIAMOND_RATE', () => {
    it('should be 0.7 (creator gets 70%)', () => {
      expect(DIAMOND_RATE).toBe(0.7);
    });
  });

  describe('PLATFORM_FEE_RATE', () => {
    it('should be 0.10 (10%)', () => {
      expect(PLATFORM_FEE_RATE).toBe(0.10);
    });

    it('should be less than 1 (cannot take more than 100%)', () => {
      expect(PLATFORM_FEE_RATE).toBeLessThan(1);
    });

    it('should be positive', () => {
      expect(PLATFORM_FEE_RATE).toBeGreaterThan(0);
    });
  });

  describe('MIN_TIP_AMOUNT', () => {
    it('should be $0.50', () => {
      expect(MIN_TIP_AMOUNT).toBe(0.50);
    });
  });

  describe('MAX_TIP_AMOUNT', () => {
    it('should be $10,000', () => {
      expect(MAX_TIP_AMOUNT).toBe(10000);
    });

    it('should be greater than MIN_TIP_AMOUNT', () => {
      expect(MAX_TIP_AMOUNT).toBeGreaterThan(MIN_TIP_AMOUNT);
    });
  });

  describe('COIN_PRICE_RATE', () => {
    it('should be $0.99 per 100 coins', () => {
      expect(COIN_PRICE_RATE).toBe(0.99);
    });
  });

  describe('Cross-constant consistency', () => {
    it('platform fee + creator share should not exceed 100%', () => {
      // Creator gets DIAMOND_RATE (70%) of coins as diamonds
      // Platform takes PLATFORM_FEE_RATE (10%) on tips
      expect(PLATFORM_FEE_RATE + DIAMOND_RATE).toBeLessThanOrEqual(1.0);
    });

    it('min tip should be at least enough for 1 diamond to receiver', () => {
      const netAfterFee = MIN_TIP_AMOUNT * (1 - PLATFORM_FEE_RATE);
      const diamondsFromMinTip = netAfterFee / DIAMOND_TO_USD;
      expect(diamondsFromMinTip).toBeGreaterThanOrEqual(1);
    });
  });
});
