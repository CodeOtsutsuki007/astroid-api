import { Injectable } from '@nestjs/common';
import { RiskEngine } from './risk.engine';
import { RiskAssessment, RiskConfig, RiskFactorsInput, RiskRule } from './risk.types';
import { EventBusService } from '../../events/event-bus.service';
import { DomainEventName } from '../../events/event-names';

/**
 * Application-facing risk service. Wraps the pure {@link RiskEngine}, emits a
 * RiskEvaluated domain event (with full factor breakdown for audit metadata),
 * and is called by the transactions pipeline.
 */
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class RiskService {
  constructor(
    private readonly engine: RiskEngine,
    private readonly eventBus: EventBusService,
  ) {}

  @OnEvent(DomainEventName.TransactionCreated, { async: true })
  async handleTransactionCreated(event: { payload?: { transactionId: string; amount?: string; assetCode?: string; recipientAddress?: string; agentId?: string }; organizationId?: string; transactionId?: string; amount?: string; assetCode?: string; recipientAddress?: string }): Promise<void> {
    const payload = event.payload || event;
    const orgId = event.organizationId || 'default-org';
    const txId = payload.transactionId || event.transactionId || '';
    const amtNum = payload.amount ? parseFloat(payload.amount) : 0;
    await this.evaluate(
      orgId,
      {
        amount: isNaN(amtNum) ? 0 : amtNum,
        sourceAccount: payload.agentId ?? 'unknown',
        destinationAccount: payload.recipientAddress ?? 'unknown',
        transactionType: 'transfer',
      },
      {
        transactionId: txId,
      },
    );
  }

  /**
   * Full evaluation with event emission. The emitted event payload includes
   * the complete factor breakdown so the audit listener captures it as metadata.
   */
  async evaluate(
    organizationId: string,
    input: RiskFactorsInput,
    context: { transactionId?: string; actorId?: string; config?: Partial<RiskConfig>; rules?: RiskRule[] } = {},
  ): Promise<RiskAssessment> {
    const assessment = this.engine.assess(input, context.config, context.rules);
    await this.eventBus.emit(
      DomainEventName.RiskEvaluated,
      {
        transactionId: context.transactionId,
        score: assessment.score,
        band: assessment.band,
        factors: assessment.factors,
        canAutoExecute: assessment.canAutoExecute,
      },
      {
        organizationId,
        actorId: context.actorId,
        aggregateType: 'transaction',
        aggregateId: context.transactionId,
      },
    );
    return assessment;
  }

  /** Synchronous assessment without event emission (used by simulate). */
  assess(
    input: RiskFactorsInput,
    config?: Partial<RiskConfig>,
    rules?: RiskRule[],
  ): RiskAssessment {
    return this.engine.assess(input, config, rules);
  }
}
