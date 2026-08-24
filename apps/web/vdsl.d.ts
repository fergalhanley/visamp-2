/**
 * `.vdsl` files are DSL source, inlined as a string at build time by the
 * `turbopack.rules` entry in `next.config.ts`.
 */
declare module "*.vdsl" {
  const source: string;
  export default source;
}
