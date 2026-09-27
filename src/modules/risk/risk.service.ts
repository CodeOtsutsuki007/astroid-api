import { Injectable } from '@nestjs/common';
import { RiskEngine } from './risk.engine';
import { RiskAssessment, RiskConfig, RiskFactorsInput, RiskRule } from './risk.types';
import { EventBusService } from '../../events/event-bus.service';
import { DomainEventName } from '../../events/event-names';
import { OnEvent } from '@nestjs/event-emitter';
import { DomainEventEnvelope, TransactionCreatedPayload } from '../../events/domain-event.types';
import { PrismaService } from '../../database/prisma.service';
import { Logger } from '@nestjs/common';

/**
 * Application-facing risk service. Wraps the pure {@link RiskEngine}, emits a
 * RiskEvaluated domain event (with full factor breakdown for audit metadata),
 * and is called by the transactions pipeline.
 */
@Injectable()
export class RiskService {
  private readonly logger = new Logger(RiskService.name);

  constructor(
    private readonly engine: RiskEngine,
    private readonly eventBus: EventBusService,
    private readonly prisma: PrismaService,
  ) {}

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

  @OnEvent(DomainEventName.TransactionCreated)
  async handleTransactionCreated(envelope: DomainEventEnvelope<TransactionCreatedPayload>): Promise<void> {
    try {
      const { transactionId, amount, recipientAddress } = envelope.payload;
      const organizationId = envelope.organizationId;
      if (!transactionId || !organizationId) {
        return;
      }

      const amountNum = parseFloat(amount) || 0;
      const assessment = this.engine.assess({
        amount: amountNum,
        recipientAddress,
        isNewRecipient: false,
        velocityCount1h: 1,
        velocityAmount1h: amountNum,
      });

      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: {
          riskScore: assessment.score,
          riskBand: assessment.band,
        },
      });

      await this.eventBus.emit(
        DomainEventName.RiskEvaluated,
        {
          transactionId,
          score: assessment.score,
          band: assessment.band,
          factors: assessment.factors,
          canAutoExecute: assessment.canAutoExecute,
        },
        {
          organizationId,
          actorId: envelope.actorId,
          aggregateType: 'transaction',
          aggregateId: transactionId,
        },
      );
    } catch (error) {
      this.logger.error(`Failed to process risk scoring for transaction: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
