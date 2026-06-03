import type { UserRole } from "@prisma/client";

export function toFeRole(role: UserRole): string {
  return role;
}

export function toAuthUserDto(u: {
  id: number;
  email: string;
  fullName: string | null;
  username: string | null;
  avatarUrl: string | null;
  location: string | null;
  role: UserRole;
}) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    username: u.username,
    avatarUrl: u.avatarUrl,
    location: u.location,
    name: u.fullName || u.username || u.email,
    role: toFeRole(u.role),
  };
}
