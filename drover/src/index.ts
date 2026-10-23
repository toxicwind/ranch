/**
 * Drover Public API & Modular Exports
 */
export * from './models/registry';
export * from './util/helpers';
export * from './providers/index';
export * from './experts/profiles';
export * from './router/index';
export * from './acp/index';

import { ModelRegistry } from './models/registry';
import { ExpertEngine } from './experts/profiles';
import { HerdRouter } from './router/index';
import { ACPBridge } from './acp/index';
import {
  NvidiaProvider,
  GroqProvider,
  CerebrasProvider,
  OpenRouterProvider,
  LocalHerdProvider
} from './providers/index';

export function createDroverCore() {
  const registry = new ModelRegistry();
  const experts = new ExpertEngine(registry);
  const providers = [
    new NvidiaProvider(),
    new GroqProvider(),
    new CerebrasProvider(),
    new OpenRouterProvider(),
    new LocalHerdProvider()
  ];
  const router = new HerdRouter(providers);
  const acp = new ACPBridge();

  return {
    registry,
    experts,
    providers,
    router,
    acp
  };
}
