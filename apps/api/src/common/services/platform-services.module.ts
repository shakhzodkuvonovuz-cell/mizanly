import { Module, Global } from '@nestjs/common';
import { PublishWorkflowService } from './publish-workflow.service';
import { CounterReconciliationService } from './counter-reconciliation.service';
import { SearchReconciliationService } from './search-reconciliation.service';
import { MeilisearchSyncService } from './meilisearch-sync.service';
import { ABTestingService } from './ab-testing.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { MeilisearchService } from '../../modules/search/meilisearch.service';

/**
 * Platform-level services module.
 * Registers cross-cutting services that any module can use.
 */
@Global()
@Module({
  providers: [
    PublishWorkflowService,
    CounterReconciliationService,
    SearchReconciliationService,
    MeilisearchSyncService,
    MeilisearchService,
    ABTestingService,
    PaymentReconciliationService,
    CircuitBreakerService,
  ],
  exports: [
    PublishWorkflowService,
    CounterReconciliationService,
    SearchReconciliationService,
    MeilisearchSyncService,
    MeilisearchService,
    ABTestingService,
    PaymentReconciliationService,
    CircuitBreakerService,
  ],
})
export class PlatformServicesModule {}
