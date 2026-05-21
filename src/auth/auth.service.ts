import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { Prisma, User } from '@prisma/client';

@Injectable({})
export class AuthService {
  constructor(
    private readonly prismaService: PrismaService,
    private jwtService: JwtService,
  ) {}

  async signUpUser(user: Prisma.UserCreateInput) {
    let createdUser: User;
    await this.prismaService.$transaction(async (tx) => {
      createdUser = await tx.user.create({
        data: user,
      });
    });

    return createdUser;
  }

  async handleLogin(user: Prisma.UserCreateInput) {
    let foundUser: User | null = await this.prismaService.user.findUnique({
      where: { googleId: user.googleId },
    });

    if (!foundUser) {
      foundUser = await this.signUpUser(user);
    }

    const jwt = this.jwtService.sign(
      { email: foundUser.email, sub: foundUser.id },
      { secret: process.env.JWT_SECRET },
    );

    return { jwt, payload: { email: foundUser.email, sub: foundUser.id } };
  }
}
