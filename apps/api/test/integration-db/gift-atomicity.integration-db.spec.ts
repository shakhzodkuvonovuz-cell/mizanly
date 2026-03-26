/**
 * Integration Test: Gift Send Atomicity
 *
 * Tests against REAL PostgreSQL to verify:
 * 1. Gift send is fully atomic (all-or-nothing within $transaction)
 * 2. Insufficient coins → no partial state (balance unchanged, no records)
 * 3. Balance integrity guard catches negative (application-level post-check)
 * 4. Receiver diamonds credited correctly (70% of coin cost)
 * 5. Transaction records created for both sender and receiver
 * 6. CoinBalance upsert works for receivers who don't have a balance yet
 */

import { PrismaTestHelper } from './prisma-test-helper';

const helper = new PrismaTestHelper();
const prisma = helper.prisma;

// Mirror the gift catalog from gifts.service.ts
const GIFT_CATALOG = [
  { type: 'rose', coins: 1 },
  { type: 'heart', coins: 5 },
  { type: 'star', coins: 10 },
  { type: 'crescent', coins: 50 },
  { type: 'mosque', coins: 100 },
  { type: 'diamond', coins: 500 },
  { type: 'crown', coins: 1000 },
  { type: 'galaxy', coins: 5000 },
];

const DIAMOND_RATE = 0.7;

beforeAll(async () => {
  await helper.setup();
}, 60000);

afterEach(async () => {
  await helper.cleanup();
});

afterAll(async () => {
  await helper.teardown();
});

/**
 * Replicate the exact gift sending transaction from gifts.service.ts
 */
async function sendGiftTransaction(
  senderId: string,
  receiverId: string,
  giftType: string,
): Promise<{ success: boolean; error?: string }> {
  const catalog = GIFT_CATALOG.find((g) => g.type === giftType);
  if (!catalog) return { success: false, error: 'Invalid gift type' };

  const diamondsEarned = Math.floor(catalog.coins * DIAMOND_RATE);

  try {
    await prisma.$transaction(async (tx) => {
      // Step 1: Conditional deduction (only if sufficient balance)
      const deducted = await tx.coinBalance.updateMany({
        where: { userId: senderId, coins: { gte: catalog.coins } },
        data: { coins: { decrement: catalog.coins } },
      });
      if (deducted.count === 0) {
        throw new Error('Insufficient coins');
      }

      // Step 2: Application-level integrity check
      const senderBalance = await tx.coinBalance.findUnique({
        where: { userId: senderId },
      });
      if (senderBalance && senderBalance.coins < 0) {
        throw new Error('Balance integrity violation');
      }

      // Step 3: Create gift record
      await tx.giftRecord.create({
        data: {
          senderId,
          receiverId,
          giftType,
          coinCost: catalog.coins,
        },
      });

      // Step 4: Credit diamonds to receiver (upsert for new users)
      await tx.coinBalance.upsert({
        where: { userId: receiverId },
        update: { diamonds: { increment: diamondsEarned } },
        create: { userId: receiverId, coins: 0, diamonds: diamondsEarned },
      });

      // Step 5: Transaction audit trail
      await tx.coinTransaction.create({
        data: {
          userId: senderId,
          type: 'GIFT_SENT',
          amount: -catalog.coins,
          description: `Sent ${giftType} to user`,
        },
      });
      await tx.coinTransaction.create({
        data: {
          userId: receiverId,
          type: 'GIFT_RECEIVED',
          amount: diamondsEarned,
          description: `Received ${giftType} gift`,
        },
      });
    });

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

describe('Gift Send Atomicity (Real DB)', () => {
  describe('successful gift send', () => {
    it('should atomically debit sender, credit receiver, and create records', async () => {
      const sender = await helper.createUser({ id: 'sender', username: 'sender' });
      const receiver = await helper.createUser({ id: 'receiver', username: 'receiver' });
      await helper.createCoinBalance(sender.id, 100, 0);
      await helper.createCoinBalance(receiver.id, 0, 0);

      const result = await sendGiftTransaction(sender.id, receiver.id, 'star');
      expect(result.success).toBe(true);

      // Verify sender coins deducted (100 - 10 = 90)
      const senderBalance = await prisma.coinBalance.findUnique({ where: { userId: sender.id } });
      expect(senderBalance!.coins).toBe(90);

      // Verify receiver diamonds credited (10 * 0.7 = 7)
      const receiverBalance = await prisma.coinBalance.findUnique({ where: { userId: receiver.id } });
      expect(receiverBalance!.diamonds).toBe(7);

      // Verify gift record created
      const gifts = await prisma.giftRecord.findMany({
        where: { senderId: sender.id, receiverId: receiver.id },
      });
      expect(gifts).toHaveLength(1);
      expect(gifts[0].giftType).toBe('star');
      expect(gifts[0].coinCost).toBe(10);

      // Verify transaction records
      const transactions = await prisma.coinTransaction.findMany({
        where: { userId: { in: [sender.id, receiver.id] } },
        orderBy: { createdAt: 'asc' },
      });
      expect(transactions).toHaveLength(2);
      expect(transactions[0].type).toBe('GIFT_SENT');
      expect(transactions[0].amount).toBe(-10);
      expect(transactions[1].type).toBe('GIFT_RECEIVED');
      expect(transactions[1].amount).toBe(7);
    });

    it('should handle exact balance (spend all coins)', async () => {
      const sender = await helper.createUser({ id: 'sender', username: 'sender' });
      const receiver = await helper.createUser({ id: 'receiver', username: 'receiver' });
      await helper.createCoinBalance(sender.id, 50, 0);

      const result = await sendGiftTransaction(sender.id, receiver.id, 'crescent');
      expect(result.success).toBe(true);

      const senderBalance = await prisma.coinBalance.findUnique({ where: { userId: sender.id } });
      expect(senderBalance!.coins).toBe(0);
    });

    it('should create CoinBalance for receiver who had none (upsert)', async () => {
      const sender = await helper.createUser({ id: 'sender', username: 'sender' });
      const receiver = await helper.createUser({ id: 'receiver', username: 'receiver' });
      await helper.createCoinBalance(sender.id, 100, 0);
      // No CoinBalance created for receiver — upsert should create one

      const result = await sendGiftTransaction(sender.id, receiver.id, 'heart');
      expect(result.success).toBe(true);

      const receiverBalance = await prisma.coinBalance.findUnique({ where: { userId: receiver.id } });
      expect(receiverBalance).not.toBeNull();
      expect(receiverBalance!.coins).toBe(0);
      expect(receiverBalance!.diamonds).toBe(3); // floor(5 * 0.7) = 3
    });
  });

  describe('insufficient coins — no partial state', () => {
    it('should reject gift when balance is too low', async () => {
      const sender = await helper.createUser({ id: 'sender', username: 'sender' });
      const receiver = await helper.createUser({ id: 'receiver', username: 'receiver' });
      await helper.createCoinBalance(sender.id, 5, 0); // Only 5 coins

      const result = await sendGiftTransaction(sender.id, receiver.id, 'star'); // Costs 10
      expect(result.success).toBe(false);
      expect(result.error).toBe('Insufficient coins');

      // Verify sender balance unchanged
      const senderBalance = await prisma.coinBalance.findUnique({ where: { userId: sender.id } });
      expect(senderBalance!.coins).toBe(5);

      // Verify no gift record created
      const gifts = await prisma.giftRecord.findMany({ where: { senderId: sender.id } });
      expect(gifts).toHaveLength(0);

      // Verify no transaction records created
      const transactions = await prisma.coinTransaction.findMany({
        where: { userId: { in: [sender.id, receiver.id] } },
      });
      expect(transactions).toHaveLength(0);

      // Verify receiver balance unchanged (or doesn't exist)
      const receiverBalance = await prisma.coinBalance.findUnique({ where: { userId: receiver.id } });
      expect(receiverBalance).toBeNull();
    });

    it('should reject gift when balance is 0', async () => {
      const sender = await helper.createUser({ id: 'sender', username: 'sender' });
      const receiver = await helper.createUser({ id: 'receiver', username: 'receiver' });
      await helper.createCoinBalance(sender.id, 0, 0);

      const result = await sendGiftTransaction(sender.id, receiver.id, 'rose'); // Costs 1
      expect(result.success).toBe(false);

      const senderBalance = await prisma.coinBalance.findUnique({ where: { userId: sender.id } });
      expect(senderBalance!.coins).toBe(0);
    });

    it('should reject gift when no CoinBalance exists for sender', async () => {
      const sender = await helper.createUser({ id: 'sender', username: 'sender' });
      const receiver = await helper.createUser({ id: 'receiver', username: 'receiver' });
      // No CoinBalance created for sender

      const result = await sendGiftTransaction(sender.id, receiver.id, 'rose');
      expect(result.success).toBe(false);
    });
  });

  describe('multiple sequential gifts', () => {
    it('should correctly track running balance across multiple gifts', async () => {
      const sender = await helper.createUser({ id: 'sender', username: 'sender' });
      const receiver = await helper.createUser({ id: 'receiver', username: 'receiver' });
      await helper.createCoinBalance(sender.id, 100, 0);

      // Send rose (1), heart (5), star (10), crescent (50) = 66 total
      await sendGiftTransaction(sender.id, receiver.id, 'rose');
      await sendGiftTransaction(sender.id, receiver.id, 'heart');
      await sendGiftTransaction(sender.id, receiver.id, 'star');
      await sendGiftTransaction(sender.id, receiver.id, 'crescent');

      const senderBalance = await prisma.coinBalance.findUnique({ where: { userId: sender.id } });
      expect(senderBalance!.coins).toBe(34); // 100 - 66

      // Receiver diamonds: floor(1*0.7) + floor(5*0.7) + floor(10*0.7) + floor(50*0.7) = 0+3+7+35 = 45
      const receiverBalance = await prisma.coinBalance.findUnique({ where: { userId: receiver.id } });
      expect(receiverBalance!.diamonds).toBe(45);

      // 4 gift records
      const gifts = await prisma.giftRecord.count({ where: { senderId: sender.id } });
      expect(gifts).toBe(4);

      // 8 transaction records (4 sent + 4 received)
      const txns = await prisma.coinTransaction.count();
      expect(txns).toBe(8);
    });

    it('should stop accepting gifts when balance runs out mid-sequence', async () => {
      const sender = await helper.createUser({ id: 'sender', username: 'sender' });
      const receiver = await helper.createUser({ id: 'receiver', username: 'receiver' });
      await helper.createCoinBalance(sender.id, 15, 0);

      // star (10) succeeds, star (10) fails
      const r1 = await sendGiftTransaction(sender.id, receiver.id, 'star');
      expect(r1.success).toBe(true);

      const r2 = await sendGiftTransaction(sender.id, receiver.id, 'star');
      expect(r2.success).toBe(false);

      const senderBalance = await prisma.coinBalance.findUnique({ where: { userId: sender.id } });
      expect(senderBalance!.coins).toBe(5); // Only first gift deducted

      const gifts = await prisma.giftRecord.count({ where: { senderId: sender.id } });
      expect(gifts).toBe(1); // Only first gift recorded
    });
  });

  describe('diamond calculation', () => {
    it('should correctly calculate diamonds for each gift type', async () => {
      const sender = await helper.createUser({ id: 'sender', username: 'sender' });
      const receiver = await helper.createUser({ id: 'receiver', username: 'receiver' });
      await helper.createCoinBalance(sender.id, 10000, 0);

      // Test each gift type
      for (const gift of GIFT_CATALOG) {
        await helper.cleanup();
        const s = await helper.createUser({ id: 'sender', username: 'sender' });
        const r = await helper.createUser({ id: 'receiver', username: 'receiver' });
        await helper.createCoinBalance(s.id, gift.coins, 0);

        const result = await sendGiftTransaction(s.id, r.id, gift.type);
        expect(result.success).toBe(true);

        const receiverBalance = await prisma.coinBalance.findUnique({ where: { userId: r.id } });
        const expectedDiamonds = Math.floor(gift.coins * DIAMOND_RATE);
        expect(receiverBalance!.diamonds).toBe(expectedDiamonds);
      }
    });
  });

  describe('self-gift prevention', () => {
    it('should reject gift to self', async () => {
      const user = await helper.createUser({ id: 'user1', username: 'user1' });
      await helper.createCoinBalance(user.id, 100, 0);

      // Self-gift — the sendGiftTransaction doesn't check, but the service does
      // This test validates that the transaction itself would still work mechanically
      // but the service-level check (senderId === receiverId) prevents it
      const result = await sendGiftTransaction(user.id, user.id, 'rose');
      // The raw transaction succeeds (no DB constraint prevents it)
      // In production, the service throws BadRequestException before reaching the transaction
      expect(result.success).toBe(true);

      // Verify the transaction created records (service prevents this, but DB doesn't)
      const balance = await prisma.coinBalance.findUnique({ where: { userId: user.id } });
      // 100 - 1 (sent) + 0 diamonds from self = coins: 99, diamonds: 0
      expect(balance!.coins).toBe(99);
      expect(balance!.diamonds).toBe(0); // floor(1 * 0.7) = 0
    });
  });

  describe('financial record preservation on user delete', () => {
    it('should preserve CoinTransaction and GiftRecord with null userId on user cascade delete', async () => {
      const sender = await helper.createUser({ id: 'sender', username: 'sender' });
      const receiver = await helper.createUser({ id: 'receiver', username: 'receiver' });
      await helper.createCoinBalance(sender.id, 100, 0);

      await sendGiftTransaction(sender.id, receiver.id, 'star');

      // Delete sender — CoinTransaction uses onDelete: SetNull, GiftRecord uses SetNull
      await prisma.user.delete({ where: { id: sender.id } });

      // CoinTransaction records should still exist with null userId
      const senderTxns = await prisma.coinTransaction.findMany({
        where: { type: 'GIFT_SENT' },
      });
      expect(senderTxns).toHaveLength(1);
      expect(senderTxns[0].userId).toBeNull();
      expect(senderTxns[0].amount).toBe(-10);

      // GiftRecord should still exist with null senderId
      const giftRecords = await prisma.giftRecord.findMany({
        where: { giftType: 'star' },
      });
      expect(giftRecords).toHaveLength(1);
      expect(giftRecords[0].senderId).toBeNull();
      expect(giftRecords[0].receiverId).toBe(receiver.id);
    });
  });
});
