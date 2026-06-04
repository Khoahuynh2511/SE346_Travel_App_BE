import { prisma } from './src/database/client.js';

async function clearAll() {
  try {
    // Delete all pending users
    const deletedPending = await prisma.pendingUser.deleteMany({});
    console.log(`Deleted ${deletedPending.count} pending users.`);

    // Delete all permanent users
    // Note: This will also delete related records due to ON DELETE CASCADE in schema
    const deletedUsers = await prisma.user.deleteMany({});
    console.log(`Deleted ${deletedUsers.count} permanent users.`);

    console.log('Database cleanup complete. System is now fresh.');
  } catch (error) {
    console.error('Error during cleanup:', error);
  }
}

clearAll().catch(console.error).finally(() => process.exit(0));
