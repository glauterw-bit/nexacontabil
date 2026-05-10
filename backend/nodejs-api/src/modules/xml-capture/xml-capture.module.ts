import { Module } from '@nestjs/common';
import { XmlCaptureService } from './xml-capture.service';
import { XmlCaptureResolver } from './xml-capture.resolver';
import { PrismaService } from '../../database/prisma.service';

@Module({
  providers: [XmlCaptureService, XmlCaptureResolver, PrismaService],
  exports: [XmlCaptureService],
})
export class XmlCaptureModule {}
