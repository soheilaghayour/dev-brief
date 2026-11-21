import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../common/prisma/prisma.service.js';
import type { Auth } from './auth.js';
import { MeService } from './me.service.js';

describe('MeService.deleteMe', () => {
  it('keeps the session when deleting the user fails, so the user is never half signed out', async () => {
    const prisma = {
      copilotQuery: { deleteMany: vi.fn() },
      llmUsage: { updateMany: vi.fn() },
      user: { delete: vi.fn() },
      $transaction: vi.fn().mockRejectedValue(new Error('db down')),
    };
    const auth = { api: { signOut: vi.fn() } };
    const service = new MeService(prisma as unknown as PrismaService, auth as unknown as Auth);

    await expect(service.deleteMe('u1', {})).rejects.toThrow('db down');
    expect(auth.api.signOut).not.toHaveBeenCalled();
  });
});
