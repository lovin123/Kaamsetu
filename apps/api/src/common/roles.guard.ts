import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import {
  hasAnyPermission,
  roleSatisfies,
  type Permission,
} from '@kaamsetu/shared';
import { PERMISSIONS_KEY, ROLES_KEY } from './decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPerms = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles?.length && !requiredPerms?.length) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.role) {
      throw new ForbiddenException('Insufficient role');
    }

    const roleOk =
      !requiredRoles?.length || roleSatisfies(user.role, requiredRoles);
    const permOk =
      !requiredPerms?.length || hasAnyPermission(user.role, requiredPerms);

    if (!roleOk || !permOk) {
      throw new ForbiddenException('Insufficient role');
    }
    return true;
  }
}
