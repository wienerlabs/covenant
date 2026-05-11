/**
 * Bundled Covenant Anchor IDL.
 *
 * Re-exported so consumers don't have to chase the JSON path. The IDL ships
 * inside the npm package under `idl/covenant.json` for tooling that needs the
 * raw file, and under this import for ergonomic TS use.
 *
 * ```ts
 * import { CovenantClient, COVENANT_IDL } from "covenant-sdk";
 *
 * const covenant = CovenantClient.fromProvider(provider, COVENANT_IDL);
 * ```
 */
import covenantIdl from "./idl/covenant.json";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const COVENANT_IDL: any = covenantIdl;
