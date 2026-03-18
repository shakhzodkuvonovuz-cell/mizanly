import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Standard success envelope */
export class ApiSuccessResponse<T = unknown> {
  @ApiProperty({ example: true }) success: boolean;
  @ApiProperty() data: T;
  @ApiProperty({ example: '2026-03-18T12:00:00.000Z' }) timestamp: string;
}

/** Standard paginated response */
export class PaginatedMeta {
  @ApiPropertyOptional({ example: 'abc123', nullable: true }) cursor: string | null;
  @ApiProperty({ example: true }) hasMore: boolean;
}

export class ApiPaginatedResponse<T = unknown> {
  @ApiProperty({ example: true }) success: boolean;
  @ApiProperty({ isArray: true }) data: T[];
  @ApiProperty() meta: PaginatedMeta;
  @ApiProperty({ example: '2026-03-18T12:00:00.000Z' }) timestamp: string;
}

/** Standard error responses */
export class ApiErrorResponse {
  @ApiProperty({ example: false }) success: boolean;
  @ApiProperty({ example: 400 }) statusCode: number;
  @ApiProperty({ example: 'Validation failed' }) message: string;
  @ApiPropertyOptional({ example: ['title must be a string'] }) errors?: string[];
  @ApiProperty({ example: '2026-03-18T12:00:00.000Z' }) timestamp: string;
}

export class ApiUnauthorizedResponse {
  @ApiProperty({ example: false }) success: boolean;
  @ApiProperty({ example: 401 }) statusCode: number;
  @ApiProperty({ example: 'Unauthorized' }) message: string;
}

export class ApiNotFoundResponse {
  @ApiProperty({ example: false }) success: boolean;
  @ApiProperty({ example: 404 }) statusCode: number;
  @ApiProperty({ example: 'Resource not found' }) message: string;
}

export class ApiConflictResponse {
  @ApiProperty({ example: false }) success: boolean;
  @ApiProperty({ example: 409 }) statusCode: number;
  @ApiProperty({ example: 'Already exists' }) message: string;
}
