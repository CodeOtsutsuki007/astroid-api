import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RiskService } from '../risk.service';
import { RiskEngine } from '../risk.engine';
import { EventBusService } from '../../../events/event-bus.service';
import { DomainEventName } from '../../../events/event-names';
import { PrismaService } from '../../../database/prisma.service';

describe('RiskService Event Handling', () => {
  let riskService: RiskService;
  let riskEngine: RiskEngine;
  let eventBus: EventBusService;
  let prisma: PrismaService;

  beforeEach(() => {
    riskEngine = {
      assess: vi.fn().mockReturnValue({
        score: 15,
        band: 'LOW',
        factors: [],
        canAutoExecute: true,
      }),
    } as unknown as RiskEngine;

    eventBus = {
      emit: vi.fn().mockResolvedValue(undefined),
    } as unknown as EventBusService;

    prisma = {
      transaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;

    riskService = new RiskService(riskEngine, eventBus);
  });

  it('should evaluate risk and emit event upon transaction.created event', async () => {
    const envelope = {
      id: 'evt-1',
      name: DomainEventName.TransactionCreated,
      organizationId: 'org-1',
      actorId: 'agent-1',
      timestamp: Date.now(),
      aggregateType: 'transaction',
      aggregateId: 'tx-1',
      payload: {
        transactionId: 'tx-1',
        amount: '500',
        assetCode: 'USDC',
        recipientAddress: 'GABC...',
      },
    };

    await riskService.handleTransactionCreated(envelope as never);

    expect(riskEngine.assess).toHaveBeenCalled();
    expect(eventBus.emit).toHaveBeenCalledWith(
      DomainEventName.RiskEvaluated,
      expect.any(Object),
      expect.any(Object)
    );
  });
});
