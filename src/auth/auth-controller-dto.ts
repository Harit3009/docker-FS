import { IsEmail, IsString, IsUUID } from 'class-validator';
export class MockSignupDto {
  @IsString()
  name: string;
  @IsEmail()
  email: string;
  @IsUUID()
  googleId: string;
}
