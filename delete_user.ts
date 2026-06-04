import { prisma } from './src/database/client.js';

async function del() {
  await prisma.user.delete({ where: { email: 'tung67050505@gmail.com' } });
  console.log('User deleted successfully');
}

del().catch(console.error).finally(() => process.exit(0));
