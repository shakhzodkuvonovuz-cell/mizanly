import { Module, Global } from '@nestjs/common';
import { PublishWorkflowService } from './publish-workflow.service';
import { CounterReconciliationService } from './counter-reconciliation.service';
import { SearchReconciliationService } from './search-reconciliation.service';
import { ABTestingService } from './ab-testing.service';

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
    ABTestingService,
  ],
  exports: [
    PublishWorkflowService,
    CounterReconciliationService,
    SearchReconciliationService,
    ABTestingService,
  ],
})
export class PlatformServicesModule {}
