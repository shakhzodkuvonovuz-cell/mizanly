/**
 * Single source of truth for all financial constants.
 * Used by gifts.service.ts, monetization.service.ts, and reconciliation services.
 * NEVER duplicate these values — import from here.
 */

/** 1 diamond = $0.007 USD (100 diamonds = $0.70) */
export const DIAMOND_TO_USD = 0.007;

/** For converting diamonds to USD cents: 100 / 70 */
export const DIAMONDS_PER_USD_CENT = 100 / 70;

/** Minimum diamonds required for cashout */
export const MIN_CASHOUT_DIAMONDS = 100;

/** Creator receives 70% of coin cost as diamonds */
export const DIAMOND_RATE = 0.7;

/** Platform fee rate on tips (10%) */
export const PLATFORM_FEE_RATE = 0.10;

/** Minimum tip amount in USD */
export const MIN_TIP_AMOUNT = 0.50;

/** Maximum tip amount in USD */
export const MAX_TIP_AMOUNT = 10000;

/** Coin price rate: 100 coins = $0.99 */
export const COIN_PRICE_RATE = 0.99;
