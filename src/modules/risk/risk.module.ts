import { Module } from '@nestjs/common';
import { RiskService } from './risk.service';
import { RiskEngine } from './risk.engine';
import { RiskController } from './risk.controller';
import { EventsModule } from '../../events/events.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [EventsModule, DatabaseModule],
  controllers: [RiskController],
  providers: [RiskService, RiskEngine],
  exports: [RiskService, RiskEngine],
})
export class RiskModule {}
