import {
  IsString, IsNumber, IsOptional, IsArray, IsBoolean,
  MaxLength, Min, Max, IsInt, ArrayMaxSize, IsIn, IsUrl, Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ── Products ────────────────────────────────────────────

export class CreateProductDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(2000) description: string;
  @ApiProperty() @IsNumber() @Min(0.01) @Max(1_000_000) price: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(10) @IsIn(['USD', 'EUR', 'GBP', 'SAR', 'AED', 'MYR', 'IDR', 'TRY', 'BDT', 'PKR']) currency?: string;
  @ApiProperty() @IsArray() @IsUrl({}, { each: true }) @ArrayMaxSize(10) images: string[];
  @ApiProperty() @IsString() @MaxLength(50) category: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isHalal?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isMuslimOwned?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100_000) stock?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) shippingInfo?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() halalCertUrl?: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) title?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0.01) @Max(1_000_000) price?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsUrl({}, { each: true }) @ArrayMaxSize(10) images?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isHalal?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isMuslimOwned?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0) @Max(100_000) stock?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() @IsString({ each: true }) @ArrayMaxSize(20) tags?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) location?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) shippingInfo?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() halalCertUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['ACTIVE', 'DRAFT', 'SOLD_OUT', 'REMOVED']) status?: string;
}

export class ReviewDto {
  @ApiProperty() @IsInt() @Min(1) @Max(5) rating: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

export class CreateOrderDto {
  @ApiProperty() @IsString() productId: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) quantity?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(4) installments?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) shippingAddress?: string;
}

export class UpdateOrderStatusDto {
  @ApiProperty() @IsString() @IsIn(['PENDING', 'PAID', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']) status: string;
}

// ── Halal Business Directory ────────────────────────────

export class CreateBusinessDto {
  @ApiProperty() @IsString() @MaxLength(200) name: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiProperty() @IsString() @MaxLength(50) category: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) @Matches(/^\+?[\d\s\-()]+$/, { message: 'Invalid phone number format' }) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() website?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() avatarUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() coverUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isMuslimOwned?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsUrl() halalCertUrl?: string;
}

export class UpdateBusinessDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(200) name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(50) category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(500) address?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-90) @Max(90) lat?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-180) @Max(180) lng?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) @Matches(/^\+?[\d\s\-()]+$/, { message: 'Invalid phone number format' }) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() website?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() avatarUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsUrl() coverUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isMuslimOwned?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsUrl() halalCertUrl?: string;
}

// ── Zakat ───────────────────────────────────────────────

export class CreateZakatFundDto {
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiProperty() @IsString() @MaxLength(2000) description: string;
  @ApiProperty() @IsNumber() @Min(1) @Max(10_000_000) goalAmount: number;
  @ApiProperty() @IsString() @IsIn(['INDIVIDUAL', 'MOSQUE', 'SCHOOL', 'DISASTER', 'ORPHAN', 'OTHER']) @MaxLength(50) category: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['USD', 'EUR', 'GBP', 'SAR', 'AED', 'MYR', 'IDR', 'TRY', 'BDT', 'PKR']) currency?: string;
}

export class DonateZakatDto {
  @ApiProperty() @IsNumber() @Min(0.01) @Max(1_000_000) amount: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isAnonymous?: boolean;
}

// ── Community Treasury ──────────────────────────────────

export class CreateTreasuryDto {
  @ApiProperty() @IsString() circleId: string;
  @ApiProperty() @IsString() @MaxLength(200) title: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @ApiProperty() @IsNumber() @Min(1) @Max(10_000_000) goalAmount: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsIn(['USD', 'EUR', 'GBP', 'SAR', 'AED', 'MYR', 'IDR', 'TRY', 'BDT', 'PKR']) currency?: string;
}

export class ContributeTreasuryDto {
  @ApiProperty() @IsNumber() @Min(0.01) @Max(1_000_000) amount: number;
}

// ── Premium ─────────────────────────────────────────────

export class SubscribePremiumDto {
  @ApiProperty() @IsString() @IsIn(['monthly', 'yearly']) plan: string;
}
