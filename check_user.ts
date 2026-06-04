import { prisma } from './src/database/client.js';

async function check() {
  const u = await prisma.user.findUnique({ where: { email: 'tung67050505@gmail.com' } });
  console.log(JSON.stringify(u, null, 2));
}

check().catch(console.error).finally(() => process.exit(0));
