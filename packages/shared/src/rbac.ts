import { ROLES, type Role } from './roles';

/** Fine-grained permissions used by API guards and service checks */
export const PERMISSIONS = {
  /** Org-wide: every active project (ADMIN only) */
  'projects:read_all': 'projects:read_all',
  'projects:create': 'projects:create',
  'projects:update': 'projects:update',
  /** Add/remove members on projects the actor can manage */
  'projects:manage_members': 'projects:manage_members',
  'tasks:create': 'tasks:create',
  'tasks:assign': 'tasks:assign',
  'tasks:update_status': 'tasks:update_status',
  'incidents:resolve': 'incidents:resolve',
  'materials:approve': 'materials:approve',
  'blockers:resolve': 'blockers:resolve',
  'summaries:read': 'summaries:read',
  'users:list_workers': 'users:list_workers',
  'users:list_all': 'users:list_all',
  'users:create': 'users:create',
  'users:manage_roles': 'users:manage_roles',
  'health:read': 'health:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** Site-scoped capabilities (still require ProjectMember for SUPERVISOR) */
const SUPERVISOR_PERMS: Permission[] = [
  PERMISSIONS['projects:manage_members'],
  PERMISSIONS['tasks:create'],
  PERMISSIONS['tasks:assign'],
  PERMISSIONS['tasks:update_status'],
  PERMISSIONS['incidents:resolve'],
  PERMISSIONS['materials:approve'],
  PERMISSIONS['blockers:resolve'],
  PERMISSIONS['summaries:read'],
  PERMISSIONS['users:list_workers'],
  PERMISSIONS['health:read'],
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  [ROLES.WORKER]: [],
  [ROLES.SUPERVISOR]: SUPERVISOR_PERMS,
  [ROLES.ADMIN]: [
    ...SUPERVISOR_PERMS,
    PERMISSIONS['projects:read_all'],
    PERMISSIONS['projects:create'],
    PERMISSIONS['projects:update'],
    PERMISSIONS['users:list_all'],
    PERMISSIONS['users:create'],
    PERMISSIONS['users:manage_roles'],
  ],
};

/** Account roles that can sign in with OTP (role comes from the user record) */
export const LOGIN_ROLES: readonly Role[] = [
  ROLES.WORKER,
  ROLES.SUPERVISOR,
  ROLES.ADMIN,
];

/**
 * Public OTP register assigns role automatically:
 * - First user (no admin yet) → ADMIN
 * - Otherwise → WORKER
 * Supervisors are never self-registered (admin creates them).
 */
export const SELF_REGISTER_ROLES: readonly Role[] = [
  ROLES.WORKER,
  ROLES.ADMIN,
];

export function hasPermission(role: Role, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

export function hasAnyPermission(
  role: Role,
  permissions: readonly Permission[],
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/** Site staff: supervisor or admin (not field worker) */
export function isStaffRole(role: Role): boolean {
  return role === ROLES.SUPERVISOR || role === ROLES.ADMIN;
}

export function isAdminRole(role: Role): boolean {
  return role === ROLES.ADMIN;
}

export function isFieldWorker(role: Role): boolean {
  return role === ROLES.WORKER;
}

/**
 * Whether `userRole` satisfies a `@Roles(...)` requirement.
 * ADMIN inherits SUPERVISOR capabilities.
 */
export function roleSatisfies(
  userRole: Role,
  required: readonly Role[],
): boolean {
  if (!required.length) return true;
  if (required.includes(userRole)) return true;
  if (userRole === ROLES.ADMIN && required.includes(ROLES.SUPERVISOR)) {
    return true;
  }
  return false;
}

export function roleLabel(role: Role): string {
  switch (role) {
    case ROLES.ADMIN:
      return 'Admin';
    case ROLES.SUPERVISOR:
      return 'Supervisor';
    default:
      return 'Worker';
  }
}

export function roleArticlePhrase(role: Role): string {
  switch (role) {
    case ROLES.ADMIN:
      return 'an admin';
    case ROLES.SUPERVISOR:
      return 'a supervisor';
    default:
      return 'a worker';
  }
}
