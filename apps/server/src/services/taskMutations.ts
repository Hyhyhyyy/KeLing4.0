import { PrismaClient, Prisma } from '@prisma/client';
import { TaskCompletionError } from './taskCompletion';

/** Shares the planner's user-row lock. Send HTTP responses only after commit. */
export function mutateOwnedTask<T>(db: PrismaClient, userId: string, action: (tx: Prisma.TransactionClient) => Promise<T>) {
  return db.$transaction(async tx => {
    const locked = await tx.$executeRaw`UPDATE "users" SET "id" = "id" WHERE "id" = ${userId}`;
    if (!locked) throw new TaskCompletionError('账户不存在', 404);
    return action(tx);
  }, { maxWait: 10000, timeout: 10000 });
}
