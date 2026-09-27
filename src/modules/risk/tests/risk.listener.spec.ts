import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RiskListener } from '../risk.listener';
import { RiskService } from '../risk.service';
import { PrismaService } from '../../../database/prisma.service';
import { DomainEventName } from '../../../events/event-names';

describe('RiskListener', () => {
  let listener: RiskListener;
  let riskService: RiskService;
  let prisma: PrismaService;

  beforeEach(() => {
    riskService = {
      evaluate: vi.fn().mockResolvedValue({
        score: 15,
        band: 'LOW',
        factors: [],
        canAutoExecute: true,
      }),
    } as unknown as RiskService;

    prisma = {
      transaction: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    } as unknown as PrismaService;

    listener = new RiskListener(riskService, prisma);
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

    await listener.handleTransactionCreated(envelope as never);

    expect(riskService.evaluate).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ amount: 500, assetCode: 'USDC' }),
      expect.objectContaining({ transactionId: 'tx-1', actorId: 'agent-1' }),
    );

    expect(prisma.transaction.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'tx-1' },
        data: { riskScore: 15, riskBand: 'LOW' },
      }),
    );
  });
});
