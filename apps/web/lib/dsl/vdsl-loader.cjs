/**
 * Inlines a `.vdsl` file as a string module, so DSL scripts can live in real
 * files — syntax-highlighted, lintable, diffable — and still be compiled into
 * the bundle rather than fetched at runtime.
 */
module.exports = function vdslLoader(source) {
  this.cacheable?.();
  return `const source = ${JSON.stringify(source)};\nexport default source;\n`;
};
