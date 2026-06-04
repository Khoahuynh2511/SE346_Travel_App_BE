import { prisma } from './src/database/client.js';

async function list() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, emailVerified: true }
  });
  console.log('All Users:', JSON.stringify(users, null, 2));
}

list().catch(console.error).finally(() => process.exit(0));
