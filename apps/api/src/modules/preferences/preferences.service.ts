import { Injectable } from '@nestjs/common';
import type { Preferences } from '@devbrief/shared';
import { preferenceEntries } from '../../common/preferences/preferenceEntries.js';
import { lockPreferenceWrites } from '../../common/preferences/preferenceWriteLock.js';
import { PrismaService } from '../../common/prisma/prisma.service.js';
import { toPreferences } from '../../common/preferences/toPreferences.js';

@Injectable()
export class PreferencesService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<Preferences> {
    const rows = await this.prisma.feedPreference.findMany({
      where: { userId },
      select: { kind: true, value: true, mode: true },
    });
    return toPreferences(rows);
  }

  /** Replaces the user's whole preference set in one transaction and answers what is stored. */
  async replace(userId: string, preferences: Preferences): Promise<Preferences> {
    const entries = preferenceEntries(preferences);
    await this.prisma.$transaction(async (tx) => {
      // Two delete-then-create replacements interleaved at READ COMMITTED would collide on the key.
      await lockPreferenceWrites(tx, userId);
      await tx.feedPreference.deleteMany({ where: { userId } });
      await tx.feedPreference.createMany({ data: entries.map((entry) => ({ userId, ...entry })) });
    });
    return toPreferences(entries);
  }
}
