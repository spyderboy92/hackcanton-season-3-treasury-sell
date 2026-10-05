import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

export default [
  { ignores: ['.next/**', '.next-*/**', 'out/**', 'build/**', 'next-env.d.ts'] },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    files: ['scripts/*.cjs', 'tests/*.cjs'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
];
