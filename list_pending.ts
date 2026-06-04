import { prisma } from './src/database/client.js';

async function list() {
  const p = await prisma.pendingUser.findMany();
  console.log(JSON.stringify(p, null, 2));
}

list().catch(console.error).finally(() => process.exit(0));
