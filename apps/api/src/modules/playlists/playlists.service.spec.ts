import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { PlaylistsService } from './playlists.service';

describe('PlaylistsService', () => {
  let service: PlaylistsService;
  let prisma: any;

  beforeEach(async () => {
    const mockPrisma = {
      playlist: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      playlistItem: {
        create: jest.fn(),
        findMany: jest.fn(),
        delete: jest.fn(),
        aggregate: jest.fn(),
      },
      channel: {
        findUnique: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PlaylistsService,
        {
          provide: 'PrismaService',
          useValue: mockPrisma,
        },
      ],
    }).compile();

    service = module.get<PlaylistsService>(PlaylistsService);
    prisma = module.get('PrismaService');
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});