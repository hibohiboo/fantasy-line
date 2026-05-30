
export function mockDbClient(db: unknown) {
  return { getDb: () => Promise.resolve(db) };
}
