import { parse } from '@babel/parser';

export function validateFiles(files) {
  const results = files
    .filter(f => /\.(js|jsx|ts|tsx)$/.test(f.relativePath))
    .map(f => {
      try {
        parse(f.content, { sourceType: 'module', plugins: ['jsx', 'typescript'] });
        return { file: f.relativePath, valid: true };
      } catch (err) {
        return { file: f.relativePath, valid: false, error: err.message, line: err.loc?.line };
      }
    });

  const failed = results.filter(r => !r.valid);
  return { valid: failed.length === 0, results, failed };
}
