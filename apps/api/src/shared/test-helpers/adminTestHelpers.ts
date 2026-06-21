/**
 * admin 機能の small テスト共通ヘルパー。
 *
 * - MockLambdaEvent 型: JWT claims を持つ最小 Lambda イベント型
 * - makeMockEvent: テスト用 mock event を生成する
 */

// ---- ヘルパー型 ----

/** テスト用 Lambda event の最小型 */
export type MockLambdaEvent = {
  requestContext: {
    authorizer: {
      jwt: {
        claims: Record<string, string>;
      };
    };
  };
  headers?: Record<string, string>;
};

// ---- イベントファクトリ ----

/**
 * JWT claims を持つ mock event を生成する。
 *
 * @param claims - JWT claims オブジェクト（省略時は空オブジェクト）
 * @param headers - HTTP headers（省略時は空オブジェクト）
 */
export function makeMockEvent(
  claims: Record<string, string> = {},
  headers: Record<string, string> = {},
): MockLambdaEvent {
  return {
    requestContext: {
      authorizer: {
        jwt: { claims },
      },
    },
    headers,
  };
}
