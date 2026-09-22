import appPackage from "../../../package.json";

/** VisAmp's manually maintained release number, captured by the deployed build. */
export const appVersion: string = appPackage.version;
export { engineVersion } from "@visamp/player/version";
