import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SavePostDto {
  @ApiProperty({ description: 'ID of the post to save', required: true })
  @IsString()
  postId: string;

  @ApiProperty({ description: 'Collection name (default: "default")', required: false, default: 'default' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  collectionName?: string = 'default';
}

export class MoveCollectionDto {
  @ApiProperty({ description: 'New collection name', required: true })
  @IsString()
  @MaxLength(50)
  collectionName: string;
}