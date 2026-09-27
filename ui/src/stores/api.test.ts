import { get } from "svelte/store";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  activeProfile,
  activityRevision,
  fetchPlaygroundModels,
  fetchProfiles,
  handleAPIEventMessage,
  hasListedModels,
  inFlightRequests,
  inflightRequestEntries,
  loadPlaygroundModels,
  models,
  playgroundModels,
  profileModels,
  profiles,
  setActiveProfile,
  uiConfig,
} from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  models.set([]);
  playgroundModels.set([]);
  profiles.set([]);
  activeProfile.set(null);
});

describe("api store event handling", () => {
  it("parses inflight request entries", () => {
    inFlightRequests.set(0);
    inflightRequestEntries.set([]);

    handleAPIEventMessage(
      JSON.stringify({
        type: "inflight",
        data: JSON.stringify({
          operation: "snapshot",
          requests: [
            {
              id: "7",
              timestamp: "2026-07-03T00:00:00Z",
              model: "m1",
              req_path: "/v1/chat/completions",
              method: "POST",
              req_headers: { "User-Agent": "test-agent" },
              remote_ip: "203.0.113.9",
              resp_headers: {},
              resp_bytes: 0,
              elapsed_ms: 125,
              metadata: { source: "test" },
            },
          ],
        }),
      })
    );

    expect(get(inFlightRequests)).toBe(1);
    expect(get(inflightRequestEntries)).toEqual([
      {
        id: "7",
        timestamp: "2026-07-03T00:00:00Z",
        model: "m1",
        req_path: "/v1/chat/completions",
        method: "POST",
        req_headers: { "User-Agent": "test-agent" },
        remote_ip: "203.0.113.9",
        resp_headers: {},
        resp_bytes: 0,
        elapsed_ms: 125,
        client_received_at_ms: expect.any(Number),
        metadata: { source: "test" },
      },
    ]);
  });

  it("upserts and removes inflight entries by id", () => {
    handleAPIEventMessage(JSON.stringify({
      type: "inflight",
      data: JSON.stringify({
        operation: "upsert",
        request: {
          id: "7",
          timestamp: "2026-07-03T00:00:00Z",
          model: "m1",
          req_path: "/v1/chat/completions",
          method: "POST",
          req_headers: {},
          remote_ip: "203.0.113.9",
          resp_headers: { "Content-Type": "text/event-stream" },
          resp_bytes: 42,
          elapsed_ms: 250,
        },
      }),
    }));

    expect(get(inflightRequestEntries)).toHaveLength(1);
    expect(get(inflightRequestEntries)[0].resp_bytes).toBe(42);

    handleAPIEventMessage(JSON.stringify({
      type: "inflight",
      data: JSON.stringify({ operation: "remove", id: "7" }),
    }));
    expect(get(inflightRequestEntries)).toEqual([]);
    expect(get(inFlightRequests)).toBe(0);
  });

  it("parses UI activity configuration", () => {
    handleAPIEventMessage(JSON.stringify({
      type: "uiConfig",
      data: JSON.stringify({ activity: { session_id: ["X-Trace-ID"] } }),
    }));
    expect(get(uiConfig).activity.session_id).toEqual(["X-Trace-ID"]);
  });

  it("increments activity revision for activity events", () => {
    activityRevision.set(0);

    handleAPIEventMessage(
      JSON.stringify({
        type: "activity",
        data: JSON.stringify({ id: 42 }),
      })
    );

    expect(get(activityRevision)).toBe(1);
  });

  it("applies profile change events", () => {
    activeProfile.set(null);
    handleAPIEventMessage(JSON.stringify({
      type: "profileChanged",
      data: JSON.stringify({ active: "coding" }),
    }));
    expect(get(activeProfile)).toBe("coding");
  });

  it("loads and switches profiles", async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          active: null,
          profiles: [{ id: "coding", description: "Coding", pins: { llm: "real" } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ active: "coding" }),
      });
    vi.stubGlobal("fetch", mockFetch);

    await fetchProfiles();
    expect(get(profiles)).toHaveLength(1);
    expect(get(activeProfile)).toBeNull();

    await setActiveProfile("coding");
    expect(get(activeProfile)).toBe("coding");
    expect(mockFetch).toHaveBeenLastCalledWith("/api/profiles/active", expect.objectContaining({
      method: "PUT",
      body: JSON.stringify({ name: "coding" }),
    }));
  });

  it("exposes active profile pins as Playground models", () => {
    models.set([
      {
        id: "real",
        state: "ready",
        name: "Real",
        description: "",
        unlisted: true,
        peerID: "",
        aliases: ["variant"],
        capabilities: { vision: true },
      },
      {
        id: "peer-model",
        state: "stopped",
        name: "",
        description: "",
        unlisted: true,
        peerID: "remote",
      },
    ]);
    profiles.set([{
      id: "coding",
      description: "",
      pins: {
        public: "variant",
        "remote-pin": "peer-model",
        disabled: "",
        real: "peer-model",
        variant: "peer-model",
      },
    }]);
    activeProfile.set("coding");

    expect(get(profileModels).map((model) => model.id)).toEqual(["public", "remote-pin"]);
    expect(get(profileModels)[0]).toMatchObject({
      id: "public",
      state: "ready",
      unlisted: false,
      capabilities: { vision: true },
    });
    expect(get(profileModels)[1]).toMatchObject({
      id: "remote-pin",
      peerID: "remote",
      unlisted: false,
    });
    expect(get(hasListedModels)).toBe(true);

    activeProfile.set(null);
    expect(get(profileModels)).toEqual([]);
    expect(get(hasListedModels)).toBe(false);
  });

  it("loads Playground models from /v1/models and populates playgroundModels store", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          {
            id: "model-1",
            name: "Model One",
            context_length: 4096,
            capabilities: { vision: true },
            meta: { llamaswap: { type: "model", aliases: ["alias-1"] } },
          },
          {
            id: "alias-1",
            meta: { llamaswap: { type: "alias", modelID: "model-1" } },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await loadPlaygroundModels();
    expect(mockFetch).toHaveBeenCalledWith("/v1/models");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "model-1",
      name: "Model One",
      context_length: 4096,
      aliases: ["alias-1"],
      capabilities: { vision: true },
      playgroundType: "model",
    });
    expect(get(playgroundModels)).toEqual(result);
  });

  it("coalesces overlapping fetchPlaygroundModels calls", async () => {
    type ModelResponse = {
      ok: boolean;
      json: () => Promise<{ data: [] }>;
    };
    let resolveFirst!: (response: ModelResponse) => void;
    const firstResponse = new Promise<ModelResponse>((resolve) => {
      resolveFirst = resolve;
    });
    const mockFetch = vi.fn()
      .mockReturnValueOnce(firstResponse)
      .mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const first = fetchPlaygroundModels();
    const overlapping = fetchPlaygroundModels();

    expect(overlapping).toBe(first);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    resolveFirst({
      ok: true,
      json: async () => ({ data: [] }),
    });
    await first;

    await vi.waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });
});
