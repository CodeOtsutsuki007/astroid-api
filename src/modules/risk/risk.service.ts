import { Injectable } from '@nestjs/common';
import { RiskEngine } from './risk.engine';
import { RiskAssessment, RiskConfig, RiskFactorsInput, RiskRule } from './risk.types';
import { EventBusService } from '../../events/event-bus.service';
import { DomainEventName } from '../../events/event-names';
import { TypedOnEvent } from '../../events/typed-event-listener.decorator';
import { DomainEventEnvelope, TransactionInitiatedPayload } from '../../events/domain-event.types';
import { PrismaService } from '../../database/prisma.service';

/**
 * Application-facing risk service. Wraps the pure {@link RiskEngine}, emits a
 * RiskEvaluated domain event (with full factor breakdown for audit metadata),
 * and is called by the transactions pipeline.
 */
@Injectable()
export class RiskService {
  constructor(
    private readonly engine: RiskEngine,
    private readonly eventBus: EventBusService,
    private readonly prisma?: PrismaService,
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

  /**
   * Event listener for transaction initiation. Automatically evaluates risk analysis
   * asynchronously and persists risk scores to the database upon consumption.
   */
  @TypedOnEvent('transaction.initiated')
  async handleTransactionInitiated(
    envelope: DomainEventEnvelope<TransactionInitiatedPayload>,
  ): Promise<RiskAssessment> {
    const payload = envelope.payload;
    const organizationId = envelope.organizationId || payload.organizationId;
    const transactionId = payload.transactionId;

    const input: RiskFactorsInput = {
      amount: payload.amount ? parseFloat(payload.amount) : 0,
      recipientAddress: payload.recipientAddress,
    };

    const assessment = this.engine.assess(input);

    if (organizationId && transactionId && this.prisma) {
      try {
        await this.prisma.riskAssessment.create({
          data: {
            organizationId,
            transactionId,
            score: assessment.score,
            band: assessment.band,
            factors: assessment.factors as unknown as import('@prisma/client').Prisma.InputJsonValue,
            canAutoExecute: assessment.canAutoExecute,
          },
        });
      } catch {
        // Fallback if RiskAssessment model is not yet provisioned in db or already exists
      }
    }

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
        correlationId: envelope.correlationId,
      },
    );

    return assessment;
  }
}
