import { Test, TestingModule } from '@nestjs/testing';
import { RiskService } from './risk.service';
import { RiskEngine } from './risk.engine';
import { EventBusService } from '../../events/event-bus.service';
import { PrismaService } from '../../database/prisma.service';
import { DomainEventEnvelope, TransactionInitiatedPayload } from '../../events/domain-event.types';
import { DomainEventName } from '../../events/event-names';
import { describe, expect, it, vi } from 'vitest';
import { RiskFactorsInput } from './risk.types';

describe('RiskService event handling', () => {
  let service: RiskService;
  let eventBus: EventBusService;
  let prisma: PrismaService;

  const mockEventBus = {
    emit: vi.fn().mockResolvedValue(true),
};

  const mockPrisma = {
    transaction: {
      update: vi.fn().mockResolvedValue({ id: 'tx-123' }),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskService,
        RiskEngine,
        { provide: EventBusService, useValue: mockEventBus },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<RiskService>(RiskService);
    eventBus = module.get<EventBusService>(EventBusService);
    prisma = module.get<PrismaService>(PrismaService);
    vi.clearAllMocks();
    });

  it('should handle transaction.initiated event, evaluate risk, persist scores, and emit risk.evaluated', async () => {
    const envelope: DomainEventEnvelope<TransactionInitiatedPayload> = {
      name: DomainEventName.TransactionInitiated,
      organizationId: 'org-1',
      aggregateType: 'transaction',
      aggregateId: 'tx-123',
      actorId: 'user-1',
      correlationId: 'corr-1',
      occurredAt: new Date(),
      payload: {
        transactionId: 'tx-123',
        organizationId: 'org-1',
        amount: '100.00',
        asset: 'XLM',
      },
    };

    const assessment = await service.handleTransactionInitiated(envelope);

    expect(assessment).toBeDefined();
    expect(prisma.transaction.update).toHaveBeenCalledWith({
      where: { id: 'tx-123' },
      data: {
        riskScore: assessment.score,
        riskBand: assessment.band,
      },
  });
    expect(eventBus.emit).toHaveBeenCalledWith(
      DomainEventName.RiskEvaluated,
      expect.objectContaining({
        transactionId: 'tx-123',
        score: assessment.score,
        band: assessment.band,
      }),
      expect.objectContaining({
        organizationId: 'org-1',
        actorId: 'user-1',
        aggregateType: 'transaction',
        aggregateId: 'tx-123',
        correlationId: 'corr-1',
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
