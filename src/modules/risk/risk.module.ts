import { Module } from '@nestjs/common';
import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';
import { RiskEngine } from './risk.engine';
import { RiskListener } from './risk.listener';
import { EventsModule } from '../../events/events.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [EventsModule, DatabaseModule],
  controllers: [RiskController],
  providers: [RiskService, RiskEngine, RiskListener],
  exports: [RiskService, RiskEngine],
})
export class RiskModule {}
