import { Injectable, Logger } from '@nestjs/common';
import { TypedOnEvent } from '../../events/typed-event-listener.decorator';
import { DomainEventEnvelope } from '../../events/domain-event.types';
import { DomainEventName } from '../../events/event-names';
import { RiskService } from './risk.service';
import { PrismaService } from '../../database/prisma.service';

/**
 * Listens to transaction domain events and triggers asynchronous risk analysis
 * and score persistence.
 */
@Injectable()
export class RiskListener {
  private readonly logger = new Logger(RiskListener.name);

  constructor(
    private readonly riskService: RiskService,
    private readonly prisma: PrismaService,
  ) {}

  @TypedOnEvent(DomainEventName.TransactionCreated)
  async handleTransactionCreated(envelope: DomainEventEnvelope<{ transactionId: string; amount?: string; assetCode?: string; recipientAddress?: string; agentId?: string }>): Promise<void> {
    const payload = envelope.payload;
    if (!payload || !payload.transactionId) {
      return;
    }

    try {
      const assessment = await this.riskService.evaluate(
        envelope.organizationId,
        {
          amount: payload.amount ? parseFloat(payload.amount) : 100,
          recipientAddress: payload.recipientAddress,
          assetCode: payload.assetCode,
          agentId: payload.agentId,
        },
        {
          transactionId: payload.transactionId,
          actorId: envelope.actorId,
        },
      );

      // Persist risk assessment score/band back to the transaction record or audit/risk metadata if applicable
      await this.prisma.transaction.updateMany({
        where: { id: payload.transactionId },
        data: {
          riskScore: assessment.score,
          riskBand: assessment.band,
        },
      });
    } catch (error) {
      this.logger.error(
        `Failed to evaluate risk for transaction '${payload.transactionId}': ${(error as Error).message}`,
      );
    }
  }
}
