import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy as JwtStrategy } from 'passport-jwt';
import { PASSPORT_STRATEGIES } from '../../constants';
import { PrismaService } from 'src/prisma/prisma.service';

@Injectable()
export class JwtVerifierService extends PassportStrategy(
  JwtStrategy,
  PASSPORT_STRATEGIES.INCOMING_JWT_VERIFICATION,
) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: true,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  async validate(payload) {
    const user = await this.prisma.getUserById(payload.sub);
    if (!user || user.email !== payload.email) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }
}
