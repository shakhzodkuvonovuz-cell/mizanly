import { IsString, IsIn, IsOptional } from 'class-validator';

export class AddCollaboratorDto {
  @IsString() userId: string;
  @IsOptional() @IsIn(['editor', 'viewer']) role?: string;
}

export class UpdateCollaboratorDto {
  @IsIn(['editor', 'viewer']) role: string;
}
