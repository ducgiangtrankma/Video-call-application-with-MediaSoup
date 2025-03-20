import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { MediasoupModule } from './mediasoup/mediasoup.module';

@Module({
  imports: [MediasoupModule],
  controllers: [AppController],
})
export class AppModule {}
