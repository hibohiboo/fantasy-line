import { bigint, datetime, mysqlEnum, mysqlTable, primaryKey, tinyint, varchar } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const tenantUsers = mysqlTable('users', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  cognitoSub: varchar('cognito_sub', { length: 128 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull(),
  userType: mysqlEnum('user_type', ['tenant_admin', 'tenant_user']).notNull(),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type TenantUser = typeof tenantUsers.$inferSelect;
export type NewTenantUser = typeof tenantUsers.$inferInsert;

export const tenantRoles = mysqlTable('roles', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 64 }).notNull(),
  isDefault: tinyint('is_default').notNull().default(0),
});

export type TenantRole = typeof tenantRoles.$inferSelect;
export type NewTenantRole = typeof tenantRoles.$inferInsert;

export const tenantUserRoles = mysqlTable(
  'user_roles',
  {
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull().references(() => tenantUsers.id),
    roleId: bigint('role_id', { mode: 'number', unsigned: true }).notNull().references(() => tenantRoles.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roleId] })],
);

export type TenantUserRole = typeof tenantUserRoles.$inferSelect;
export type NewTenantUserRole = typeof tenantUserRoles.$inferInsert;

export const tenantRolePermissions = mysqlTable(
  'role_permissions',
  {
    roleId: bigint('role_id', { mode: 'number', unsigned: true }).notNull().references(() => tenantRoles.id),
    resource: varchar('resource', { length: 64 }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.resource, t.action] })],
);

export type TenantRolePermission = typeof tenantRolePermissions.$inferSelect;
export type NewTenantRolePermission = typeof tenantRolePermissions.$inferInsert;
