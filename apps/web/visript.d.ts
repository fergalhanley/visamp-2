/** Visript source is bundled as text; legacy extensions remain supported. */
declare module "*.viscript" {
  const source: string;
  export default source;
}
declare module "*.vdsl" {
  const source: string;
  export default source;
}
