import { IsString, MaxLength } from 'class-validator';

export class SaveToCollectionDto {
  @IsString()
  @MaxLength(100)
  collection: string;
}
