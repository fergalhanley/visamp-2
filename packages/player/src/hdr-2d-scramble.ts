/** Same byte-addressing presets as engine/src/scramble.rs; channels stay float. */
export const SCRAMBLE_PRESETS = [
  [-100,100,0,3,24],[4,1,-2,3,1],[4,5,6,7,1],[6,4,5,7,1],[2,0,1,3,1],
  [55,1,77,36,20],[20,21,22,23,11],[-23,-22,-21,-20,1],[-24,-23,-22,-21,1],
  [20,1,-22,3,5],[4,21,-22,3,5],[27,-29,44,2,12],[-9,-36,11,20,12],
  [32,48,-40,43,12],[-47,22,19,26,12],[-72,-33,-5,-100,12],[49,-88,52,31,12],
] as const;
export function scrambleAddressMap(width: number, height: number, kind: number): Int32Array<ArrayBuffer> {
  const p = SCRAMBLE_PRESETS[kind - 1];
  if (!p || width < 1 || width >= 27 || height < 1) throw new Error("Invalid narrow scramble map");
  const length = width * height * 4;
  const map = Int32Array.from({ length }, (_, i) => i);
  const w = width * 4 - 4;
  const end = length - width * 4 * p[4];
  for (let i = w; i < end; i += 4) for (let c = 0; c < 4; c++) {
    const source = i + w + p[c]!;
    map[i + c] = source >= 0 && source < length ? map[source]! : -1;
  }
  return map;
}
