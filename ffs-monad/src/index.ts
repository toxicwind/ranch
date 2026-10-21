export * from "./monad";
export * from "./client";

import { FfsMonad, type FfsConfig } from "./client";

export default function ffs(config?: FfsConfig): FfsMonad {
  return FfsMonad.of(config);
}
