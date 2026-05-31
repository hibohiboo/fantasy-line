import type { Plugin } from '@vue/test-utils'
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

/**
 * vue-router 5 の RouterClassic が @vue/test-utils の Plugin 型に代入できない
 * 型不整合を吸収するテスト用ファクトリ。
 * @vue/test-utils が vue-router 5 に対応した際はこのキャストを除去できる。
 *
 * @param routes - ルート定義。省略時は `[{ path: '/' }]` のみ
 * @returns @vue/test-utils の global.plugins に渡せる Plugin 型のルーターインスタンス
 */
export function makeRouter(
  routes: RouteRecordRaw[] = [{ path: '/', component: { template: '<div />' } }],
): Plugin {
  return createRouter({
    history: createWebHistory(),
    routes,
  }) as unknown as Plugin
}
