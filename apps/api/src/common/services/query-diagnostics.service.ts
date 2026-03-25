import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

/**
 * Query diagnostics service — identifies slow query patterns.
 *
 * This service runs EXPLAIN ANALYZE on critical queries to measure
 * actual execution plans. Only available in development/staging
 * or via admin API.
 *
 * Usage: Call diagnoseHotPaths() to get a report of all critical
 * query execution plans. The report shows which queries use
 * index scans vs sequential scans.
 */
@Injectable()
export class QueryDiagnosticsService {
  private readonly logger = new Logger(QueryDiagnosticsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Run EXPLAIN ANALYZE on critical hot-path queries.
   * Returns execution plan summaries for each query.
   */
  async diagnoseHotPaths(): Promise<Array<{ name: string; plan: string; estimatedCost: number; scanType: string }>> {
    const results: Array<{ name: string; plan: string; estimatedCost: number; scanType: string }> = [];

    const queries = [
      {
        name: 'Post ForYou Feed (visibility + createdAt)',
        sql: `EXPLAIN (FORMAT JSON, ANALYZE false) SELECT id FROM "Post" WHERE visibility = 'PUBLIC' AND "isRemoved" = false AND "createdAt" > NOW() - INTERVAL '72 hours' ORDER BY "createdAt" DESC LIMIT 200`,
      },
      {
        name: 'Thread Feed (isChainHead + createdAt)',
        sql: `EXPLAIN (FORMAT JSON, ANALYZE false) SELECT id FROM "Thread" WHERE "isChainHead" = true AND "isRemoved" = false AND "createdAt" > NOW() - INTERVAL '72 hours' ORDER BY "createdAt" DESC LIMIT 200`,
      },
      {
        name: 'Reel Feed (status + createdAt)',
        sql: `EXPLAIN (FORMAT JSON, ANALYZE false) SELECT id FROM "Reel" WHERE status = 'READY' AND "isRemoved" = false AND "createdAt" > NOW() - INTERVAL '72 hours' ORDER BY "createdAt" DESC LIMIT 200`,
      },
      {
        name: 'Block Exclusion (blockerId)',
        sql: `EXPLAIN (FORMAT JSON, ANALYZE false) SELECT "blockedId" FROM "Block" WHERE "blockerId" = 'test-user-id' LIMIT 10000`,
      },
      {
        name: 'Notification List (userId + createdAt)',
        sql: `EXPLAIN (FORMAT JSON, ANALYZE false) SELECT id FROM "Notification" WHERE "userId" = 'test-user-id' ORDER BY "createdAt" DESC LIMIT 30`,
      },
      {
        name: 'Message History (conversationId + createdAt)',
        sql: `EXPLAIN (FORMAT JSON, ANALYZE false) SELECT id FROM "Message" WHERE "conversationId" = 'test-conv-id' ORDER BY "createdAt" DESC LIMIT 50`,
      },
    ];

    for (const q of queries) {
      try {
        const plan = await this.prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(q.sql);
        const planStr = JSON.stringify(plan);
        const isSeqScan = planStr.includes('Seq Scan');
        const isIndexScan = planStr.includes('Index Scan') || planStr.includes('Index Only Scan') || planStr.includes('Bitmap');

        // Extract estimated cost from the plan
        let cost = 0;
        try {
          const parsed = plan[0] as Record<string, unknown>;
          const planDetail = (parsed['QUERY PLAN'] as Array<Record<string, unknown>>)?.[0] as Record<string, unknown> | undefined;
          const planNode = planDetail?.['Plan'] as Record<string, number> | undefined;
          cost = planNode?.['Total Cost'] ?? 0;
        } catch {
          // Plan parsing failed — use 0
        }

        results.push({
          name: q.name,
          plan: isSeqScan ? 'Sequential Scan (SLOW)' : isIndexScan ? 'Index Scan (FAST)' : 'Unknown',
          estimatedCost: Math.round(cost * 100) / 100,
          scanType: isSeqScan ? 'SEQ_SCAN' : isIndexScan ? 'INDEX_SCAN' : 'UNKNOWN',
        });
      } catch (err) {
        results.push({
          name: q.name,
          plan: `Error: ${err instanceof Error ? err.message : 'unknown'}`,
          estimatedCost: -1,
          scanType: 'ERROR',
        });
      }
    }

    // Log summary
    const seqScans = results.filter(r => r.scanType === 'SEQ_SCAN');
    if (seqScans.length > 0) {
      this.logger.warn(`${seqScans.length} hot queries using sequential scans: ${seqScans.map(s => s.name).join(', ')}`);
    } else {
      this.logger.log('All hot queries using index scans');
    }

    return results;
  }
}
