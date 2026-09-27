import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RiskService } from './risk.service';
import { RiskEngine } from './risk.engine';
import { EventBusService } from '../../events/event-bus.service';
import { DomainEventName } from '../../events/event-names';
import { DomainEventEnvelope, TransactionInitiatedPayload } from '../../events/domain-event.types';
import { RiskFactorsInput } from './risk.types';

describe('RiskService Event Handler', () => {
  let riskService: RiskService;
  let riskEngine: RiskEngine;
  let eventBus: EventBusService;

  beforeEach(() => {
    riskEngine = new RiskEngine();
    eventBus = {
      emit: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventBusService;
    riskService = new RiskService(riskEngine, eventBus);
  });

  it('should handle transaction.initiated event and emit risk.evaluated', async () => {
    const payload: TransactionInitiatedPayload = {
      transactionId: 'tx-123',
      organizationId: 'org-456',
      amount: '150.50',
      recipientAddress: 'GABCD...',
    };

    const envelope: DomainEventEnvelope<TransactionInitiatedPayload> = {
      name: DomainEventName.TransactionInitiated,
      organizationId: 'org-456',
      aggregateType: 'transaction',
      aggregateId: 'tx-123',
      payload,
      occurredAt: new Date(),
    };

    const assessment = await riskService.handleTransactionInitiated(envelope);

    expect(assessment).toBeDefined();
    expect(typeof assessment.score).toBe('number');
    expect(assessment.band).toBeDefined();
    expect(eventBus.emit).toHaveBeenCalledWith(
      DomainEventName.RiskEvaluated,
      expect.objectContaining({
        transactionId: 'tx-123',
        score: assessment.score,
        band: assessment.band,
      }),
      expect.objectContaining({
        organizationId: 'org-456',
        aggregateType: 'transaction',
        aggregateId: 'tx-123',
      }),
    );
  });

  it('should persist risk assessment to database when prisma client is provided', async () => {
    const prismaMock = {
      riskAssessment: {
        create: vi.fn().mockResolvedValue({ id: 'risk-rec-1' }),
      },
    };
    const serviceWithPrisma = new RiskService(riskEngine, eventBus, prismaMock as any);

    const payload: TransactionInitiatedPayload = {
      transactionId: 'tx-789',
      organizationId: 'org-999',
      amount: '500.00',
      recipientAddress: 'GXYZ...',
    };

    const envelope: DomainEventEnvelope<TransactionInitiatedPayload> = {
      name: DomainEventName.TransactionInitiated,
      organizationId: 'org-999',
      aggregateType: 'transaction',
      aggregateId: 'tx-789',
      payload,
      occurredAt: new Date(),
    };

    const assessment = await serviceWithPrisma.handleTransactionInitiated(envelope);

    expect(assessment).toBeDefined();
    expect(prismaMock.riskAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-999',
          transactionId: 'tx-789',
          score: assessment.score,
          band: assessment.band,
        }),
      }),
    );
  });
});


const lowRisk: RiskFactorsInput = {
  amount: 20,
  asset: 'USDC',
  knownRecipient: true,
  recentTransactionCount: 1,
  walletAgeDays: 365,
  policyViolations: 0,
  hourUtc: 12,
};

function createEventBus() {
  return { emit: vi.fn().mockResolvedValue(undefined) } as unknown as Pick<EventBusService, 'emit'> & { emit: ReturnType<typeof vi.fn> };
}
