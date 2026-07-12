import { bigint, datetime, mysqlEnum, mysqlTable, primaryKey, varchar } from 'drizzle-orm/mysql-core';
import { sql } from 'drizzle-orm';

export const serviceUsers = mysqlTable('users', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  cognitoSub: varchar('cognito_sub', { length: 128 }).notNull().unique(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  userType: mysqlEnum('user_type', ['servicer_admin', 'servicer_delegate']).notNull(),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type ServiceUser = typeof serviceUsers.$inferSelect;
export type NewServiceUser = typeof serviceUsers.$inferInsert;

export const serviceTenants = mysqlTable('tenants', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  slug: varchar('slug', { length: 32 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  status: mysqlEnum('status', ['active', 'suspended', 'deleted']).notNull().default('active'),
  createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type ServiceTenant = typeof serviceTenants.$inferSelect;
export type NewServiceTenant = typeof serviceTenants.$inferInsert;

export const serviceRoles = mysqlTable('roles', {
  id: bigint('id', { mode: 'number', unsigned: true }).autoincrement().primaryKey(),
  name: varchar('name', { length: 64 }).notNull().unique(),
});

export type ServiceRole = typeof serviceRoles.$inferSelect;
export type NewServiceRole = typeof serviceRoles.$inferInsert;

export const serviceUserTenantRoles = mysqlTable(
  'user_tenant_roles',
  {
    userId: bigint('user_id', { mode: 'number', unsigned: true }).notNull().references(() => serviceUsers.id),
    tenantId: bigint('tenant_id', { mode: 'number', unsigned: true }).notNull().references(() => serviceTenants.id),
    roleId: bigint('role_id', { mode: 'number', unsigned: true }).notNull().references(() => serviceRoles.id),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tenantId, t.roleId] })],
);

export type ServiceUserTenantRole = typeof serviceUserTenantRoles.$inferSelect;
export type NewServiceUserTenantRole = typeof serviceUserTenantRoles.$inferInsert;

export const serviceRolePermissions = mysqlTable(
  'role_permissions',
  {
    roleId: bigint('role_id', { mode: 'number', unsigned: true }).notNull().references(() => serviceRoles.id),
    resource: varchar('resource', { length: 64 }).notNull(),
    action: varchar('action', { length: 64 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.resource, t.action] })],
);

export type ServiceRolePermission = typeof serviceRolePermissions.$inferSelect;
export type NewServiceRolePermission = typeof serviceRolePermissions.$inferInsert;
