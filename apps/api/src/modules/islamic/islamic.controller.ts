import {
  Controller,
  Get,
  Query,
  Param,
  UseGuards,
  ParseFloatPipe,
  ParseIntPipe,
  Optional,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiParam } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, IsIn, Min, Max } from 'class-validator';
import { IslamicService } from './islamic.service';
import {
  PrayerTimesResponse,
  CalculationMethod,
  Hadith,
  Mosque,
  ZakatCalculationResponse,
  RamadanInfoResponse,
} from './islamic.service';
import { OptionalClerkAuthGuard } from '../../common/guards/optional-clerk-auth.guard';

class PrayerTimesQueryDto {
  @ApiQuery({ name: 'lat', required: true, description: 'Latitude', example: 24.7136 })
  lat: number;

  @ApiQuery({ name: 'lng', required: true, description: 'Longitude', example: 46.6753 })
  lng: number;

  @ApiQuery({ name: 'method', required: false, description: 'Calculation method (MWL, ISNA, Egypt, Makkah, Karachi)', example: 'MWL' })
  method?: string;

  @ApiQuery({ name: 'date', required: false, description: 'Date in YYYY-MM-DD format (default today)', example: '2026-03-13' })
  date?: string;
}

class MosquesQueryDto {
  @ApiQuery({ name: 'lat', required: true, description: 'Latitude', example: 24.7136 })
  lat: number;

  @ApiQuery({ name: 'lng', required: true, description: 'Longitude', example: 46.6753 })
  lng: number;

  @ApiQuery({ name: 'radius', required: false, description: 'Search radius in kilometers', example: 10 })
  radius?: number;
}

class ZakatCalculationQueryDto {
  @ApiQuery({ name: 'cash', required: true, description: 'Cash amount in base currency', example: 5000 })
  cash: number;

  @ApiQuery({ name: 'gold', required: true, description: 'Gold amount in grams', example: 50 })
  gold: number;

  @ApiQuery({ name: 'silver', required: true, description: 'Silver amount in grams', example: 200 })
  silver: number;

  @ApiQuery({ name: 'investments', required: true, description: 'Investment value', example: 10000 })
  investments: number;

  @ApiQuery({ name: 'debts', required: true, description: 'Debts owed', example: 2000 })
  debts: number;
}

class RamadanInfoQueryDto {
  @ApiQuery({ name: 'year', required: false, description: 'Year (default current year)', example: 2026 })
  year?: number;

  @ApiQuery({ name: 'lat', required: false, description: 'Latitude for prayer times', example: 24.7136 })
  lat?: number;

  @ApiQuery({ name: 'lng', required: false, description: 'Longitude for prayer times', example: 46.6753 })
  lng?: number;
}

@ApiTags('Islamic')
@Controller('islamic')
@UseGuards(OptionalClerkAuthGuard)
export class IslamicController {
  constructor(private islamicService: IslamicService) {}

  @Get('prayer-times')
  @ApiOperation({ summary: 'Get prayer times for location' })
  @ApiResponse({ status: 200, description: 'Prayer times returned', type: Object })
  async getPrayerTimes(@Query() query: PrayerTimesQueryDto): Promise<PrayerTimesResponse> {
    return this.islamicService.getPrayerTimes({
      lat: query.lat,
      lng: query.lng,
      method: query.method,
      date: query.date,
    });
  }

  @Get('prayer-times/methods')
  @ApiOperation({ summary: 'List prayer time calculation methods' })
  @ApiResponse({ status: 200, description: 'List of methods', type: Object })
  getPrayerMethods(): CalculationMethod[] {
    return this.islamicService.getPrayerMethods();
  }

  @Get('hadith/daily')
  @ApiOperation({ summary: 'Get daily hadith (rotates daily)' })
  @ApiResponse({ status: 200, description: 'Daily hadith', type: Object })
  getDailyHadith(): Hadith {
    return this.islamicService.getDailyHadith();
  }

  @Get('hadith/:id')
  @ApiOperation({ summary: 'Get specific hadith by ID' })
  @ApiParam({ name: 'id', description: 'Hadith ID (1-40)', example: 1 })
  @ApiResponse({ status: 200, description: 'Hadith found', type: Object })
  @ApiResponse({ status: 404, description: 'Hadith not found' })
  getHadithById(@Param('id', ParseIntPipe) id: number): Hadith {
    return this.islamicService.getHadithById(id);
  }

  @Get('hadith')
  @ApiOperation({ summary: 'List hadiths with pagination' })
  @ApiQuery({ name: 'cursor', required: false, description: 'Cursor for pagination (hadith ID)', example: 10 })
  @ApiResponse({ status: 200, description: 'Hadith list with pagination metadata', type: Object })
  getHadiths(@Query('cursor', new Optional(), ParseIntPipe) cursor?: number) {
    return this.islamicService.getHadiths(cursor);
  }

  @Get('mosques')
  @ApiOperation({ summary: 'Find nearby mosques' })
  @ApiResponse({ status: 200, description: 'List of nearby mosques', type: Object })
  getNearbyMosques(@Query() query: MosquesQueryDto): Mosque[] {
    return this.islamicService.getNearbyMosques(query.lat, query.lng, query.radius);
  }

  @Get('zakat/calculate')
  @ApiOperation({ summary: 'Calculate zakat obligation' })
  @ApiResponse({ status: 200, description: 'Zakat calculation result', type: Object })
  calculateZakat(@Query() query: ZakatCalculationQueryDto): ZakatCalculationResponse {
    return this.islamicService.calculateZakat({
      cash: query.cash,
      gold: query.gold,
      silver: query.silver,
      investments: query.investments,
      debts: query.debts,
    });
  }

  @Get('ramadan')
  @ApiOperation({ summary: 'Get Ramadan information' })
  @ApiResponse({ status: 200, description: 'Ramadan details', type: Object })
  getRamadanInfo(@Query() query: RamadanInfoQueryDto): RamadanInfoResponse {
    return this.islamicService.getRamadanInfo({
      year: query.year,
      lat: query.lat,
      lng: query.lng,
    });
  }
}