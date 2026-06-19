import { globalIgnores } from 'eslint/config';
import {
  defineConfigWithVueTs,
  vueTsConfigs,
} from '@vue/eslint-config-typescript';
import pluginVue from 'eslint-plugin-vue';
import pluginVitest from '@vitest/eslint-plugin';
import pluginOxlint from 'eslint-plugin-oxlint';
import skipFormatting from 'eslint-config-prettier/flat';
import { baseConfig } from './base.js';

export default defineConfigWithVueTs(
  baseConfig,
  {
    name: 'app/files-to-lint',
    files: ['**/*.{vue,ts,mts,tsx}'],
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/*.test.ts', 'e2e/**/*.test.ts'],
    rules: {
      'sonarjs/no-forced-browser-interaction': ['off'],
    },
  },

  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),

  skipFormatting,
);
