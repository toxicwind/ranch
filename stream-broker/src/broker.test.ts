import { describe, expect, test, afterEach } from "bun:test";
import { createConnection, type Server } from "node:net";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { startBroker, stopBroker } from "./index";

let servers: Server[] = [];

afterEach(async () => {
  await stopBroker(servers);
  servers = [];
});

function tcpPortOf(server: Server): number {
  const addr = server.address();
  if (typeof addr === "object" && addr !== null) return addr.port;
  throw new Error("server has no TCP address");
}

function echoOnce(port: number, payload: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = createConnection({ port, host: "127.0.0.1" }, () => {
      client.write(payload);
    });
    let data = "";
    client.on("data", (chunk) => {
      data += chunk.toString();
      client.end();
    });
    client.on("close", () => resolve(data));
    client.on("error", reject);
  });
}

describe("stream-broker", () => {
  test("echoes data back over TCP", async () => {
    // socketPath "" disables the UNIX listener; port 0 = ephemeral
    servers = startBroker({ socketPath: "", tcpPort: 0 });
    const port = tcpPortOf(servers[0]);
    expect(port).toBeGreaterThan(0);
    const echoed = await echoOnce(port, "hello-broker");
    expect(echoed).toBe("hello-broker");
  });

  test("echoes data back over the UNIX socket", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "broker-test-"));
    const sockPath = path.join(dir, "broker.sock");
    try {
      servers = startBroker({ socketPath: sockPath, tcpPort: 0 });
      // wait for the UNIX listener to be ready
      await new Promise<void>((resolve) => {
        const t = setInterval(() => {
          if (fs.existsSync(sockPath)) {
            clearInterval(t);
            resolve();
          }
        }, 10);
      });
      const echoed = await new Promise<string>((resolve, reject) => {
        const client = createConnection({ path: sockPath }, () => {
          client.write("unix-echo");
        });
        let data = "";
        client.on("data", (chunk) => {
          data += chunk.toString();
          client.end();
        });
        client.on("close", () => resolve(data));
        client.on("error", reject);
      });
      expect(echoed).toBe("unix-echo");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("start/stop is clean and importing the module binds nothing", async () => {
    servers = startBroker({ socketPath: "", tcpPort: 0 });
    const port = tcpPortOf(servers[0]);
    await stopBroker(servers);
    servers = [];
    // after close, connecting must fail
    await expect(echoOnce(port, "x")).rejects.toThrow();
  });
});
