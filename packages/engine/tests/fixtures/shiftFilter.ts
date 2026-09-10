
const SHIFT_FILTER_PARAMS = [
    { r: -100, g: 100, b: 0, a: 3, max: 24 },
    { r: 4, g: 1, b: -2, a: 3, max: 1 },
    { r: 4, g: 5, b: 6, a: 7, max: 1 },
    { r: 6, g: 4, b: 5, a: 7, max: 1 },
    { r: 2, g: 0, b: 1, a: 3, max: 1 },
    { r: 55, g: 1, b: 77, a: 36, max: 20 },
    { r: 20, g: 21, b: 22, a: 23, max: 11 },
    { r: -23, g: -22, b: -21, a: -20, max: 1 },
    { r: -24, g: -23, b: -22, a: -21, max: 1 },
    { r: 20, g: 1, b: -22, a: 3, max: 5 },
    { r: 4, g: 21, b: -22, a: 3, max: 5 },
    { r: 27, g: -29, b: 44, a: 2, max: 12 },
    { r: -9, g: -36, b: 11, a: 20, max: 12 },
    { r: 32, g: 48, b: -40, a: 43, max: 12 },
    { r: -47, g: 22, b: 19, a: 26, max: 12 },
    { r: -72, g: -33, b: -5, a: -100, max: 12 },
    { r: 49, g: -88, b: 52, a: 31, max: 12 },
];

// @ts-ignore: don't apply types to params
function pshift(stdlib, foreign, heap) {
    'use asm';
    var w = foreign.w | 0,
        max = foreign.max | 0,
        r = foreign.r | 0,
        g = foreign.g | 0,
        b = foreign.b | 0,
        a = foreign.a | 0,
        i = 0,
        f = 0;

    for (i = w | 0; (i | 0) < (max | 0); i = (i + 4) | 0) {
        f = (i + w) | 0;
        heap[i << 2 >> 2] = heap[(f + r) | 0 << 2 >> 2];
        heap[((i | 0) + 1) | 0 << 2 >> 2] = heap[(f + g) | 0 << 2 >> 2];
        heap[((i | 0) + 2) | 0 << 2 >> 2] = heap[(f + b) | 0 << 2 >> 2];
        heap[((i | 0) + 3) | 0 << 2 >> 2] = heap[(f + a) | 0 << 2 >> 2];
    }
}

export function shiftFilter(ctx: CanvasRenderingContext2D, index: number) {
    const imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    pshift({Math: Math}, {
        ...SHIFT_FILTER_PARAMS[index-1],
        w: ctx.canvas.width * 4 - 4,
        max: imageData.data.length - (ctx.canvas.width * 4 * SHIFT_FILTER_PARAMS[index-1].max)
    }, imageData.data);
    ctx.putImageData(imageData, 0, 0);
}
