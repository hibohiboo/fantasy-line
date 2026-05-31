import { describe, it, expect } from 'vitest';
import { CreateVillageSchema } from './village';

describe('CreateVillageSchema', () => {
  it('正常ケース: 村名が1文字の場合は通過する', () => {
    const result = CreateVillageSchema.safeParse({ name: 'a' });
    expect(result.success).toBe(true);
  });

  it('正常ケース: 村名が128文字の場合は通過する', () => {
    const result = CreateVillageSchema.safeParse({ name: 'a'.repeat(128) });
    expect(result.success).toBe(true);
  });

  it('バリデーションエラー: 村名が空文字の場合はエラー', () => {
    const result = CreateVillageSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('バリデーションエラー: 村名が129文字の場合はエラー', () => {
    const result = CreateVillageSchema.safeParse({ name: 'a'.repeat(129) });
    expect(result.success).toBe(false);
  });
});
