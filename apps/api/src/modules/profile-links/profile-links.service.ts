import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';
import { CreateProfileLinkDto } from './dto/create-profile-link.dto';
import { UpdateProfileLinkDto } from './dto/update-profile-link.dto';

const MAX_LINKS = 5;

@Injectable()
export class ProfileLinksService {
  constructor(private prisma: PrismaService) {}

  async getLinks(userId: string) {
    return this.prisma.profileLink.findMany({
      where: { userId },
      orderBy: { position: 'asc' },
    });
  }

  async addLink(userId: string, dto: CreateProfileLinkDto) {
    const count = await this.prisma.profileLink.count({ where: { userId } });
    if (count >= MAX_LINKS) {
      throw new BadRequestException(`Maximum ${MAX_LINKS} links allowed per profile`);
    }

    const lastLink = await this.prisma.profileLink.findFirst({
      where: { userId },
      orderBy: { position: 'desc' },
    });
    const position = (lastLink?.position ?? -1) + 1;

    return this.prisma.profileLink.create({
      data: { userId, title: dto.title, url: dto.url, position },
    });
  }

  async updateLink(userId: string, id: string, dto: UpdateProfileLinkDto) {
    const link = await this.prisma.profileLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Link not found');
    if (link.userId !== userId) throw new ForbiddenException();

    return this.prisma.profileLink.update({
      where: { id },
      data: dto,
    });
  }

  async deleteLink(userId: string, id: string) {
    const link = await this.prisma.profileLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException('Link not found');
    if (link.userId !== userId) throw new ForbiddenException();

    await this.prisma.profileLink.delete({ where: { id } });
    return { message: 'Link removed' };
  }

  async reorder(userId: string, orderedIds: string[]) {
    const links = await this.prisma.profileLink.findMany({ where: { userId } });
    const userLinkIds = new Set(links.map((l) => l.id));

    for (const id of orderedIds) {
      if (!userLinkIds.has(id)) throw new ForbiddenException(`Link ${id} not found`);
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.profileLink.update({
          where: { id },
          data: { position: index },
        }),
      ),
    );

    return this.getLinks(userId);
  }
}
