#version 300 es
precision highp float;
precision highp int;
precision highp isampler2D;
uniform sampler2D u_source;
uniform sampler2D u_history;
uniform isampler2D u_map;
uniform ivec2 u_size;
uniform ivec4 u_offsets;
uniform int u_exclude;
uniform int u_kind;
uniform int u_pass;
uniform vec4 u_refresh;
uniform int u_refresh_steps;
out vec4 frag_color;

// All effect addressing uses Canvas2D's top-left, straight RGBA byte order.
ivec2 canvasPixel(int pixel) {
    return ivec2(pixel % u_size.x, u_size.y - 1 - pixel / u_size.x);
}
float byteAt(int address) {
    if (address < 0 || address >= u_size.x * u_size.y * 4) return 0.0;
    return texelFetch(u_source, canvasPixel(address / 4), 0)[address % 4];
}
vec4 sampleClamped(ivec2 xy) {
    return texelFetch(u_source, clamp(xy, ivec2(0), u_size - 1), 0);
}
vec4 sampleCanvas(vec2 pixel) {
    ivec2 p = ivec2(floor(pixel + 0.5));
    return sampleClamped(ivec2(p.x, u_size.y - 1 - p.y));
}

// Types 21–40 operate in top-left pixel coordinates. All source coordinates
// clamp at the image edge; the transforms remain defined even on a 1×1 canvas.
vec4 extendedScramble(ivec2 xy, vec4 source) {
    vec2 pos = vec2(xy.x, u_size.y - 1 - xy.y);
    vec2 centre = (vec2(u_size) - 1.0) * 0.5;
    vec2 p = pos - centre;
    if (u_kind == 21) { // Vertical RGB split
        return vec4(sampleCanvas(pos + vec2(0, 3)).r, source.g,
                    sampleCanvas(pos - vec2(0, 3)).b, source.a);
    }
    if (u_kind == 22) { // RGB prism
        return vec4(sampleCanvas(pos + vec2(4, 0)).r,
                    sampleCanvas(pos + vec2(-2, 3)).g,
                    sampleCanvas(pos + vec2(-2, -3)).b, source.a);
    }
    if (u_kind == 23) { // Chromatic zoom
        return vec4(sampleCanvas(centre + p * 0.96).r, source.g,
                    sampleCanvas(centre + p * 1.04).b, source.a);
    }
    if (u_kind == 24) return vec4(source.gbr, source.a); // Channel carousel
    if (u_kind == 25) return sampleCanvas(pos + vec2(sin(pos.y * 0.08) * 6.0, 0));
    if (u_kind == 26) return sampleCanvas(pos + vec2(0, sin(pos.x * 0.08) * 6.0));
    if (u_kind == 27) return sampleCanvas(pos + vec2(sin(pos.y * 0.08), sin(pos.x * 0.06 + 0.8)) * 6.0);
    if (u_kind == 28) return sampleCanvas(centre + p * 0.96); // Expansion
    if (u_kind == 29) return sampleCanvas(centre + p * 1.04); // Contraction
    float lensRadius = max(1.0, float(min(u_size.x, u_size.y)) * 0.35);
    float influence = exp(-dot(p, p) / (lensRadius * lensRadius));
    if (u_kind == 30 || u_kind == 31) { // Opposing swirls, strongest at centre
        float angle = (0.035 + 0.04 * influence) * (u_kind == 30 ? -1.0 : 1.0);
        float c = cos(angle), s = sin(angle);
        return sampleCanvas(centre + vec2(c * p.x - s * p.y, s * p.x + c * p.y));
    }
    if (u_kind == 32) { // Radial ripple: avoid normalizing the centre's zero vector
        float radius = length(p);
        return sampleCanvas(pos + p / max(radius, 1.0) * sin(radius * 0.1) * 4.0);
    }
    if (u_kind == 33) return sampleCanvas(centre + p * (1.0 + 0.12 * influence));
    if (u_kind == 34) return sampleCanvas(centre + p * (1.0 - 0.12 * influence));
    ivec2 tile = ivec2(pos) / 16;
    vec2 local = mod(pos, 16.0);
    bool evenTile = (tile.x + tile.y) % 2 == 0;
    if (u_kind == 35) { // Alternate clockwise/counterclockwise tile rotation
        vec2 rotated = evenTile ? vec2(local.y, 15.0 - local.x) : vec2(15.0 - local.y, local.x);
        return sampleCanvas(vec2(tile * 16) + rotated);
    }
    if (u_kind == 36) { // Alternate horizontal/vertical tile mirrors
        vec2 mirrored = evenTile ? vec2(15.0 - local.x, local.y) : vec2(local.x, 15.0 - local.y);
        return sampleCanvas(vec2(tile * 16) + mirrored);
    }
    if (u_kind == 37) return sampleCanvas(floor(pos / 8.0) * 8.0 + 4.0);
    if (u_kind == 38) { // Stable slips in eight-pixel scanline bands
        int shift = (int(pos.y) / 8 * 13 + 5) % 17 - 8;
        return sampleCanvas(pos + vec2(shift, 0));
    }
    if (u_kind == 39) { // Stable, independently displaced blocks (no time/random state)
        uint hash = uint(tile.x) * 1664525u + uint(tile.y) * 1013904223u + 2246822519u;
        hash ^= hash >> 16;
        vec2 shift = vec2(int(hash % 17u) - 8, int((hash >> 8) % 17u) - 8);
        return sampleCanvas(pos + shift);
    }
    return sampleCanvas(pos - sign(p) * 4.0); // 40: four-way outward split
}
vec4 retain(vec4 rgba) {
    // Match Canvas2D putImageData: retain an 8-bit premultiplied image.
    return vec4(rgba.rgb * rgba.a, rgba.a);
}
vec4 bytes(vec4 rgba) { return floor(rgba * 255.0 + 0.5) / 255.0; }
vec4 over(vec4 source, vec4 destination) {
    // Match the Canvas2D reference's 8-bit, 256-based source-over rounding.
    // https://api.skia.org/SkColorPriv_8h_source.html (SkPMSrcOver)
    vec4 s = floor(source * 255.0 + 0.5);
    vec4 d = floor(destination * 255.0 + 0.5);
    return (s + floor(d * (256.0 - s.a) / 256.0)) / 255.0;
}
void main() {
    ivec2 xy = ivec2(gl_FragCoord.xy);
    vec4 source = texelFetch(u_source, xy, 0);
    if (u_pass == 0) {
        // Canvas stores premultiplied bytes after each draw, including the
        // refresh overlay. Unpremultiply only for the original byte algorithm.
        vec4 h = texelFetch(u_history, xy, 0);
        vec4 refresh = retain(bytes(u_refresh));
        // Opaque refresh always clears, including renders between fade ticks.
        if (u_refresh.a >= 1.0) h = refresh;
        else for (int tick = 0; tick < 256; tick++) {
            if (tick >= u_refresh_steps) break;
            vec4 next = over(refresh, h);
            if (all(equal(next, h))) break;
            h = next;
        }
        vec4 result = over(source, h);
        frag_color = vec4(result.a > 0.0 ? result.rgb / result.a : vec3(0), result.a);
    } else if (u_pass == 2) {
        // History already matches the browser's premultiplied drawing buffer.
        frag_color = source;
    } else if (u_pass == 3) {
        frag_color = source; // Disabled effect: scene is already premultiplied.
    } else if (u_kind <= 17) {
        int pixel = (u_size.y - 1 - xy.y) * u_size.x + xy.x;
        if (u_size.x < 27) {
            ivec4 addresses = texelFetch(u_map, ivec2(xy.x, u_size.y - 1 - xy.y), 0);
            frag_color = retain(vec4(byteAt(addresses.r), byteAt(addresses.g), byteAt(addresses.b), byteAt(addresses.a)));
        } else {
            int i = pixel * 4;
            int w = u_size.x * 4 - 4;
            int end = u_size.x * (u_size.y - u_exclude) * 4;
            if (i < w || i >= end) { frag_color = retain(source); return; }
            ivec4 a = ivec4(i + w) + u_offsets;
            frag_color = retain(vec4(byteAt(a.r), byteAt(a.g), byteAt(a.b), byteAt(a.a)));
        }
    } else if (u_kind == 18) {
        frag_color = retain(vec4(sampleClamped(xy + ivec2(3, 0)).r, source.g,
                          sampleClamped(xy - ivec2(3, 0)).b, source.a));
    } else if (u_kind == 19) {
        int row = u_size.y - 1 - xy.y;
        frag_color = retain(sampleClamped(xy + ivec2(row % 2 == 0 ? 4 : -4, 0)));
    } else if (u_kind == 20) {
        int row = u_size.y - 1 - xy.y;
        int direction = (xy.x / 16 + row / 16) % 2 == 0 ? 1 : -1;
        frag_color = retain(sampleClamped(xy + ivec2(4 * direction, -4 * direction)));
    } else {
        frag_color = retain(extendedScramble(xy, source));
    }
}
