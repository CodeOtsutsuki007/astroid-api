import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RiskService } from '../risk.service';
import { RiskEngine } from '../risk.engine';
import { PrismaService } from '../../../database/prisma.service';
import { DomainEventName } from '../../../events/event-names';

describe('RiskService Event Handling', () => {
  let riskService: RiskService;
  let riskEngine: RiskEngine;
  let prisma: PrismaService;

  beforeEach(() => {
    riskEngine = {
      evaluate: vi.fn().mockResolvedValue({
        score: 15,
        band: 'LOW',
        factors: [],
        canAutoExecute: true,
      }),
    } as unknown as RiskEngine;

    prisma = {
      transaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;

    riskService = new RiskService(riskEngine, prisma);
  });

  it('should evaluate risk and persist score upon transaction.created event', async () => {
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

    expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: { riskScore: 15, riskBand: 'LOW' },
      }),
    );
  });
});
