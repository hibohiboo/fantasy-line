import globals from 'globals';
import vue from 'eslint-plugin-vue';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';
import css from '@eslint/css';
import { baseConfig } from './base.js';

export default defineConfig([
  ...baseConfig,
  {
    ignores: ['dist', 'build', 'node_modules'],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,vue}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['**/*.css'],
    plugins: { css },
    language: 'css/css',
    extends: ['css/recommended'],
    rules: {
      'css/no-invalid-properties': ['warn', { allowUnknownVariables: true }],
      'css/use-baseline': ['error', { allowSelectors: ['nesting'] }],
    },
  },
  ...vue.configs['flat/vue3-recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['.vue'],
      },
    },
    rules: {
      'sonarjs/prefer-read-only-props': 'error',
    },
  },
  {
    files: ['**/*.{ts,mts,cts}'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json'],
      },
    },
    rules: {
      'sonarjs/prefer-read-only-props': 'error',
    },
  },
]);
