import { describe, test, expect } from 'vitest';
import { slugToSchemaName, validateSlug } from './tenant';

describe('slugToSchemaName', () => {
  test('"acme-corp" を変換すると "tenant_acme_corp" が返ること', () => {
    // Arrange
    const slug = 'acme-corp';

    // Act
    const result = slugToSchemaName(slug);

    // Assert
    expect(result).toBe('tenant_acme_corp');
  });

  test('"beta" を変換すると "tenant_beta" が返ること', () => {
    // Arrange
    const slug = 'beta';

    // Act
    const result = slugToSchemaName(slug);

    // Assert
    expect(result).toBe('tenant_beta');
  });

  test('"my-team-01" を変換すると "tenant_my_team_01" が返ること', () => {
    // Arrange
    const slug = 'my-team-01';

    // Act
    const result = slugToSchemaName(slug);

    // Assert
    expect(result).toBe('tenant_my_team_01');
  });
});

describe('validateSlug', () => {
  describe('有効なスラッグのとき', () => {
    test('"acme-corp" → valid であること', () => {
      // Arrange
      const slug = 'acme-corp';

      // Act
      const result = validateSlug(slug);

      // Assert
      expect(result).toEqual({ valid: true });
    });

    test('"beta" → valid であること', () => {
      // Arrange
      const slug = 'beta';

      // Act
      const result = validateSlug(slug);

      // Assert
      expect(result).toEqual({ valid: true });
    });

    test('"a1" → valid であること（最小長 2 文字）', () => {
      // Arrange
      const slug = 'a1';

      // Act
      const result = validateSlug(slug);

      // Assert
      expect(result).toEqual({ valid: true });
    });

    test('32 文字のスラッグ → valid であること（最大長）', () => {
      // Arrange
      const slug = 'a'.repeat(32);

      // Act
      const result = validateSlug(slug);

      // Assert
      expect(result).toEqual({ valid: true });
    });
  });

  describe('無効なスラッグのとき', () => {
    test('"UPPER" → バリデーションエラーが返ること（大文字を含む）', () => {
      // Arrange
      const slug = 'UPPER';

      // Act
      const result = validateSlug(slug);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBeTruthy();
      }
    });

    test('"a" → バリデーションエラーが返ること（1 文字、最小 2 文字未満）', () => {
      // Arrange
      const slug = 'a';

      // Act
      const result = validateSlug(slug);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBeTruthy();
      }
    });

    test('33 文字のスラッグ → バリデーションエラーが返ること（32 文字超）', () => {
      // Arrange
      const slug = 'a'.repeat(33);

      // Act
      const result = validateSlug(slug);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBeTruthy();
      }
    });

    test('"-abc" → バリデーションエラーが返ること（先頭ハイフン）', () => {
      // Arrange
      const slug = '-abc';

      // Act
      const result = validateSlug(slug);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBeTruthy();
      }
    });

    test('"abc-" → バリデーションエラーが返ること（末尾ハイフン）', () => {
      // Arrange
      const slug = 'abc-';

      // Act
      const result = validateSlug(slug);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBeTruthy();
      }
    });

    test('"abc_def" → バリデーションエラーが返ること（アンダースコアを含む）', () => {
      // Arrange
      const slug = 'abc_def';

      // Act
      const result = validateSlug(slug);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBeTruthy();
      }
    });

    test('"abc def" → バリデーションエラーが返ること（スペースを含む）', () => {
      // Arrange
      const slug = 'abc def';

      // Act
      const result = validateSlug(slug);

      // Assert
      expect(result.valid).toBe(false);
      if (!result.valid) {
        expect(result.reason).toBeTruthy();
      }
    });
  });
});
