import { describe, it, expect } from 'vitest';
import { CreateResidentSchema } from './resident';

describe('CreateResidentSchema', () => {
  describe('name', () => {
    it('バリデーションエラー: 空文字はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: '',
        nameKana: 'ア',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(false);
    });

    it('正常ケース: 1文字は通過する', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'a',
        nameKana: 'ア',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(true);
    });

    it('正常ケース: 128文字は通過する', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'a'.repeat(128),
        nameKana: 'ア',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(true);
    });

    it('バリデーションエラー: 129文字はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'a'.repeat(129),
        nameKana: 'ア',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('nameKana', () => {
    it('バリデーションエラー: 空文字はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: '',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(false);
    });

    it('正常ケース: 全角カタカナ1文字（ア）は通過する', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'ア',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(true);
    });

    it('正常ケース: 全角カタカナ128文字は通過する', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'ア'.repeat(128),
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(true);
    });

    it('バリデーションエラー: 129文字はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'ア'.repeat(129),
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(false);
    });

    it('バリデーションエラー: ひらがな（あ）はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'あ',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(false);
    });

    it('バリデーションエラー: 英字はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'a',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(false);
    });

    it('正常ケース: 長音符（ー）は通過する', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'ター',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(true);
    });

    it('バリデーションエラー: 半角カタカナ（ｱ）はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'ｱ',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('birthDate', () => {
    it('正常ケース: YYYY-MM-DD 形式（2000-01-15）は通過する', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'タロウ',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(true);
    });

    it('バリデーションエラー: YYYY/MM/DD 形式はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'タロウ',
        birthDate: '2000/01/15',
        villageId: 1,
      });
      expect(result.success).toBe(false);
    });

    it('バリデーションエラー: 空文字はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'タロウ',
        birthDate: '',
        villageId: 1,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('villageId', () => {
    it('正常ケース: 正の整数は通過する', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'タロウ',
        birthDate: '2000-01-15',
        villageId: 1,
      });
      expect(result.success).toBe(true);
    });

    it('バリデーションエラー: 0はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'タロウ',
        birthDate: '2000-01-15',
        villageId: 0,
      });
      expect(result.success).toBe(false);
    });

    it('バリデーションエラー: 負数はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'タロウ',
        birthDate: '2000-01-15',
        villageId: -1,
      });
      expect(result.success).toBe(false);
    });

    it('バリデーションエラー: 小数はエラー', () => {
      const result = CreateResidentSchema.safeParse({
        name: 'タロウ',
        nameKana: 'タロウ',
        birthDate: '2000-01-15',
        villageId: 1.5,
      });
      expect(result.success).toBe(false);
    });
  });
});
