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
  async handleTransactionCreated(payload: { transactionId: string; organizationId?: string; amount?: number; currency?: string; sourceAccount?: string; destinationAccount?: string; type?: string }): Promise<void> {
    const orgId = payload.organizationId || 'default-org';
    await this.evaluate(
      orgId,
      {
        amount: payload.amount ?? 0,
        currency: payload.currency ?? 'USD',
        sourceAccount: payload.sourceAccount ?? 'unknown',
        destinationAccount: payload.destinationAccount ?? 'unknown',
        transactionType: (payload.type as any) ?? 'transfer',
      },
      {
        transactionId: payload.transactionId,
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
