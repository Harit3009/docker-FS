import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AUTHGUARD_KEYS } from 'src/constants';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('google/signin')
  @UseGuards(AuthGuard(AUTHGUARD_KEYS.GOOGLE_AUTH_TOKEN))
  async googleSignin(@Req() req) {}

  @Get('google/callback')
  @UseGuards(AuthGuard(AUTHGUARD_KEYS.GOOGLE_AUTH_TOKEN))
  async googleCallback(@Req() req, @Res() res: Response) {
    const jwt = await this.authService.handleLogin(req.user);
    res.redirect('http://localhost:3000/login/success?token=' + jwt);
  }
}
