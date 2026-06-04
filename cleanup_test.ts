import { prisma } from './src/database/client.js';

async function cleanup() {
  const email = 'tung67050505@gmail.com';
  await prisma.user.deleteMany({ where: { email } });
  await prisma.pendingUser.deleteMany({ where: { email } });
  console.log('Test email cleaned up from both User and PendingUser tables');
}

cleanup().catch(console.error).finally(() => process.exit(0));
