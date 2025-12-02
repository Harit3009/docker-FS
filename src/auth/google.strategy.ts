import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Prisma } from '@prisma/client';

import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { AUTHGUARD_KEYS } from 'src/constants';

@Injectable()
export class GoogleStrategyService extends PassportStrategy(
  GoogleStrategy,
  AUTHGUARD_KEYS.GOOGLE_AUTH_TOKEN,
) {
  constructor() {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      callbackURL: process.env.GOOGLE_CALLBACK_URL!,
      scope: ['email', 'profile'],
    });
  }

  validate(accessToken, refreshToken, profile, done) {
    const { name, emails, photos, id } = profile;
    const user: Prisma.UserCreateInput = {
      email: emails[0].value,
      name: name.givenName + ' ' + name.familyName,
      profilePic: photos[0].value,
      googleId: id,
      googleAccessToken: accessToken,
      googleRefreshToken: refreshToken,
    };

    done(null, user);
  }
}
