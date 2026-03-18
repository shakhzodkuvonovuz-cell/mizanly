import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class StickersService {
  constructor(private prisma: PrismaService) {}

  async createPack(data: { name: string; coverUrl?: string; isFree?: boolean; stickers: { url: string; name?: string }[] }) {
    return this.prisma.stickerPack.create({
      data: {
        name: data.name,
        coverUrl: data.coverUrl,
        isFree: data.isFree ?? true,
        stickersCount: data.stickers.length,
        stickers: {
          createMany: {
            data: data.stickers.map((s, i) => ({ url: s.url, name: s.name, position: i })),
          },
        },
      },
      include: { stickers: { orderBy: { position: 'asc' } } },
    });
  }

  async getPack(packId: string) {
    const pack = await this.prisma.stickerPack.findUnique({
      where: { id: packId },
      include: { stickers: { orderBy: { position: 'asc' } } },
    });
    if (!pack) throw new NotFoundException('Sticker pack not found');
    return pack;
  }

  async browsePacks(cursor?: string, limit = 20) {
    const packs = await this.prisma.stickerPack.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = packs.length > limit;
    if (hasMore) packs.pop();
    return { data: packs, meta: { cursor: packs[packs.length - 1]?.id ?? null, hasMore } };
  }

  async searchPacks(query: string) {
    return this.prisma.stickerPack.findMany({
      where: { name: { contains: query, mode: 'insensitive' } },
      take: 20,
    });
  }

  async addToCollection(userId: string, packId: string) {
    await this.getPack(packId);
    return this.prisma.userStickerPack.upsert({
      where: { userId_packId: { userId, packId } },
      update: {},
      create: { userId, packId },
    });
  }

  async removeFromCollection(userId: string, packId: string) {
    try {
      await this.prisma.userStickerPack.delete({
        where: { userId_packId: { userId, packId } },
      });
    } catch (error) {
      // P2025: record not found — idempotent, treat as already removed
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        return { removed: true };
      }
      throw error;
    }
    return { removed: true };
  }

  async getMyPacks(userId: string) {
    const owned = await this.prisma.userStickerPack.findMany({
      where: { userId },
      include: { pack: { include: { stickers: { orderBy: { position: 'asc' } } } } },
      orderBy: { addedAt: 'desc' },
    });
    return owned.map(o => o.pack);
  }

  async getRecentStickers(userId: string) {
    const packs = await this.getMyPacks(userId);
    return packs.flatMap(p => p.stickers).slice(0, 30);
  }

  async getFeaturedPacks() {
    return this.prisma.stickerPack.findMany({
      where: { isFree: true },
      orderBy: { stickersCount: 'desc' },
      take: 10,
    });
  }

  async deletePack(packId: string) {
    try {
      await this.prisma.stickerPack.delete({ where: { id: packId } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException('Sticker pack not found');
      }
      throw error;
    }
    return { deleted: true };
  }
}