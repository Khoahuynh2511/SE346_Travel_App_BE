/**
 * Soft Delete Utility
 *
 * Prisma doesn't have built-in soft delete, so we use these utilities
 * to filter out soft-deleted records in queries.
 */

/**
 * Where clause to filter out soft-deleted records
 * Use this in Prisma queries: where: { ...notDeleted }
 */
export const notDeleted = { deletedAt: null };

/**
 * Check if a record is soft-deleted
 */
export function isDeleted<T extends { deletedAt: Date | null }>(record: T): boolean {
  return record.deletedAt !== null;
}

/**
 * Check if a record is active (not soft-deleted)
 */
export function isNotDeleted<T extends { deletedAt: Date | null }>(record: T): boolean {
  return record.deletedAt === null;
}
