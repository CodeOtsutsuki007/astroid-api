import { DomainEventEnvelope } from './domain-event.types';
import { DomainEventNames, DomainEventName } from './event-names';

export interface TransactionCreatedPayload {
  transactionId: string;
  amount?: string;
  assetCode?: string;
  recipientAddress?: string;
  agentId?: string;
}

export class TransactionCreatedEvent implements DomainEventEnvelope<TransactionCreatedPayload> {
  constructor(
    public readonly id: string,
    public readonly name: DomainEventNames[DomainEventName.TransactionCreated],
    public readonly timestamp: number,
    public readonly occurredAt: Date,
    public readonly aggregateType: string,
    public readonly aggregateId: string,
    public readonly payload: TransactionCreatedPayload,
    public readonly organizationId?: string,
    public readonly actorId?: string,
  ) {}
}
