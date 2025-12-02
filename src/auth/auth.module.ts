import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PrismaModule } from 'src/prisma/prisma.module';
import { PassportModule } from '@nestjs/passport';
import { GoogleStrategyService } from './google.strategy';
import { JwtModule } from '@nestjs/jwt';
import { JwtVerifierService } from './jwt-verifier.strategy';
@Module({
  controllers: [AuthController],
  providers: [AuthService, GoogleStrategyService, JwtVerifierService],
  imports: [
    PrismaModule,
    PassportModule,
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '2h' },
    }),
  ],
  exports: [AuthService, JwtVerifierService],
})
export class AuthModule {}
