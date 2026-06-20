/**
 * スラッグをデータベーススキーマ名に変換する。
 * ハイフンをアンダースコアに置換し `tenant_` プレフィックスを付与する。
 *
 * @param slug - テナントスラッグ（バリデーション済みであること）
 * @returns データベーススキーマ名（例: `"tenant_acme_corp"`）
 */
export function slugToSchemaName(slug: string): string {
  return `tenant_${slug.replaceAll('-', '_')}`;
}

/** `validateSlug` の戻り値型 */
export type SlugValidationResult =
  | { valid: true }
  | { valid: false; reason: string };

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$|^[a-z0-9]{2}$/;

/**
 * テナントスラッグのバリデーションを行う。
 *
 * ルール:
 * - 使用可能文字: 英小文字 `a-z`・数字 `0-9`・ハイフン `-`
 * - 長さ: 2〜32 文字
 * - 先頭・末尾はアルファベットまたは数字（ハイフン不可）
 *
 * @param slug - 検証対象のスラッグ
 * @returns バリデーション結果。有効なら `{ valid: true }`、無効なら `{ valid: false; reason: string }`
 */
export function validateSlug(slug: string): SlugValidationResult {
  if (slug.length < 2) {
    return { valid: false, reason: 'スラッグは 2 文字以上である必要があります' };
  }
  if (slug.length > 32) {
    return { valid: false, reason: 'スラッグは 32 文字以下である必要があります' };
  }
  if (!SLUG_PATTERN.test(slug)) {
    return {
      valid: false,
      reason:
        'スラッグは英小文字・数字・ハイフンのみ使用でき、先頭と末尾はアルファベットまたは数字である必要があります',
    };
  }
  return { valid: true };
}
