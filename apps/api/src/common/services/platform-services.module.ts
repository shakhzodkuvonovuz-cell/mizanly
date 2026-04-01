import { Module, Global } from '@nestjs/common';
import { PublishWorkflowService } from './publish-workflow.service';
import { CounterReconciliationService } from './counter-reconciliation.service';
import { SearchReconciliationService } from './search-reconciliation.service';
import { MeilisearchSyncService } from './meilisearch-sync.service';
import { ABTestingService } from './ab-testing.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { CircuitBreakerService } from './circuit-breaker.service';

/**
 * Platform-level services module.
 * Registers cross-cutting services that any module can use.
 * Note: MeilisearchService removed — belongs in SearchModule only (L02 #16 dual registration fix).
 */
@Global()
@Module({
  providers: [
    PublishWorkflowService,
    CounterReconciliationService,
    SearchReconciliationService,
    MeilisearchSyncService,
    ABTestingService,
    PaymentReconciliationService,
    CircuitBreakerService,
  ],
  exports: [
    PublishWorkflowService,
    CounterReconciliationService,
    SearchReconciliationService,
    MeilisearchSyncService,
    ABTestingService,
    PaymentReconciliationService,
    CircuitBreakerService,
  ],
})
export class PlatformServicesModule {}
