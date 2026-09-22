import enginePackage from "@visamp/engine/package.json";

/** Engine package shipped with this player build. Safe to import without WASM. */
export const engineVersion: string = enginePackage.version;
