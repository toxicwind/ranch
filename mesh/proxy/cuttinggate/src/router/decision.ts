import type { ChatBody, RouteResult } from "../strategy/router_types.ts";
import type { StrategyDeps } from "../strategy/types.ts";
import {
  tryLongctxPin,
  tryLongctx2MPin,
  longctxPinEnabled,
  longctx2MEnabled,
  estPromptTokens,
} from "../strategy/router_strategy.ts";
import { isLocalSwapModelId, LOCAL_ROLES } from "../strategy/catalog.ts";
import { freeCandidates } from "../strategy/strategy.ts";
import type { RaceOptions } from "./strategy.ts";
import { pickStrategy, raceCandidates } from "./strategy.ts";

/**
 * decide()'s return value: the route result plus the routing metadata the
 * serving layer turns into response headers (X-Cuttinggate-Strategy /
 * X-Routed-Via). RouteResult itself stays header-free on purpose — providers
 * yield status/body/timings only, and the serving layer owns the HTTP
 * envelope (see strategy/router.ts), so the header bag is declared here
 * rather than bolted onto the shared RouteResult contract.
 */
export type Decision = RouteResult & {
  headers: Record<string, string>;
};

export async function decide(
  body: ChatBody,
  ctx: StrategyDeps
): Promise<Decision> {
  // Honor long-context pins by trying them first
  // 2M context pin (higher priority)
  if (longctx2MEnabled()) {
    const estTokens = estPromptTokens(body);
    if (estTokens > 1_000_000) { // Gate at 1M est tokens for 2M pin
      const sessionId = ctx.stickyGet("")[1] ?? "";
      const result = await tryLongctx2MPin(body, sessionId);
      if (result != null) {
        return {
          ...result,
          headers: {
            "X-Cuttinggate-Strategy": "longctx-2m-pin",
            "X-Routed-Via": result.provider === "herd" ? "herd" : "flock",
          },
        };
      }
    }
  }

  // 1M context pin
  if (longctxPinEnabled()) {
    const estTokens = estPromptTokens(body);
    if (estTokens >= 0) { // Always try 1M pin if enabled
      const sessionId = ctx.stickyGet("")[1] ?? "";
      const result = await tryLongctxPin(body, sessionId);
      if (result != null) {
        return {
          ...result,
          headers: {
            "X-Cuttinggate-Strategy": "longctx-pin",
            "X-Routed-Via": result.provider === "herd" ? "herd" : "flock",
          },
        };
      }
    }
  }

  // Determine if request suits a local model (herd) or should use cloud (flock)
  const model = typeof body.model === "string" ? body.model : undefined;
  const isLocalModel = model != null && isLocalSwapModelId(model, {});
  
  // Choose backend: herd for local models, flock for cloud models
  const isHerd = isLocalModel;
  
  // Pick strategy based on request and context
  const strategyName = pickStrategy(body, ctx);
  
  // Get appropriate candidates for the chosen backend
  let candidates: [string, string][] = [];
  if (isHerd) {
    // Herd: local models via herd
    const servingModels = ctx.servingModels("herd");
    for (const model of servingModels) {
      candidates.push(["herd", model]);
    }
    // Fallback to local roles if no serving models
    if (candidates.length === 0) {
      candidates = [
        ["herd", LOCAL_ROLES.fast],
        ["herd", LOCAL_ROLES.quality],
        ["herd", LOCAL_ROLES.longctx],
      ];
    }
  } else {
    // Flock: cloud providers (excluding herd)
    const providers = ctx.providers();
    for (const provider of providers) {
      if (provider.name === "herd") continue; // Skip local provider for flock
      if (!ctx.keyOk(provider.name)) continue;
      if (!ctx.circuitOk(provider.name)) continue;
      const models = ctx.servingModels(provider.name);
      for (const model of models) {
        candidates.push([provider.name, model]);
      }
    }
    // Fallback to free candidates if no cloud providers available
    if (candidates.length === 0) {
      const allFree = freeCandidates(ctx);
      for (const [provider] of allFree) {
        if (provider !== "herd") {
          const models = ctx.servingModels(provider);
          for (const model of models) {
            candidates.push([provider, model]);
          }
        }
      }
    }
  }

  // Execute the chosen strategy on the selected backend
  const result = await raceCandidates(candidates, {
    body,
    session: ctx.stickyGet("")[1] ?? "",
    strategyName,
  });

  // Add required headers to the result
  return {
    ...result,
    headers: {
      "X-Cuttinggate-Strategy": strategyName,
      "X-Routed-Via": isHerd ? "herd" : "flock",
    },
  };
}