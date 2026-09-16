/**
 * Inlines a `.viscript` (or legacy `.vdsl`) file as a string module, so Visript scripts can live in real
 * files — syntax-highlighted, lintable, diffable — and still be compiled into
 * the bundle rather than fetched at runtime.
 */
module.exports = function visriptLoader(source) {
  this.cacheable?.();
  return `const source = ${JSON.stringify(source)};\nexport default source;\n`;
};
