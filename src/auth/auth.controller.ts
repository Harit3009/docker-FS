import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { PASSPORT_STRATEGIES } from '../../constants';
import { ReqUser } from 'src/decorators/param-decorators/user.decorator';
import { User } from '@prisma/client';
import { MockSignupDto } from './auth-controller-dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google/signin')
  @UseGuards(AuthGuard(PASSPORT_STRATEGIES.GOOGLE_AUTH_TOKEN))
  async googleSignin() {}

  @Get('google/callback')
  @UseGuards(AuthGuard(PASSPORT_STRATEGIES.GOOGLE_AUTH_TOKEN))
  async googleCallback(@Req() req, @Res() res: Response) {
    const { jwt, payload } = await this.authService.handleLogin(req.user);
    res.redirect('http://localhost:3000/login/success?token=' + jwt);
  }

  @Get('me')
  @UseGuards(AuthGuard(PASSPORT_STRATEGIES.INCOMING_JWT_VERIFICATION))
  async me(@ReqUser() user: User) {
    return {
      email: user.email,
      name: user.name,
      createdAt: user.createdAt,
      profilePic: user.profilePic,
      rootFolderId: user.rootFolderId,
    };
  }

  @Post('mockSignup')
  async testSignup(@Body() body: MockSignupDto) {
    const { jwt, payload } = await this.authService.handleLogin(body);
    return { jwt };
  }
}
