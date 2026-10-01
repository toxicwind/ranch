import { createServer, type Server, type Socket } from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";

export const DEFAULT_SOCKET_PATH =
  "/run/user/1000/sovereign-stream-broker.sock";
export const DEFAULT_TCP_PORT = 25215;
export const DEFAULT_TCP_HOST = "127.0.0.1";

export interface BrokerOptions {
  /** UNIX socket path. Pass "" to disable the UNIX listener. */
  socketPath?: string;
  tcpPort?: number;
  tcpHost?: string;
}

export function handleConnection(socket: Socket) {
  console.log(
    `Stream broker connected: ${socket.remoteAddress}:${socket.remotePort}`,
  );
  socket.setKeepAlive(true, 30000);
  socket.setNoDelay(true);

  socket.on("data", (data) => {
    // Echo back for now; in future could buffer tokens
    socket.write(data);
  });

  socket.on("end", () => {
    console.log(
      `Stream broker disconnected: ${socket.remoteAddress}:${socket.remotePort}`,
    );
  });

  socket.on("error", (err) => {
    console.error(`Stream broker error:`, err);
  });
}

/** Start the broker's listeners. Returns the bound servers for shutdown. */
export function startBroker(opts: BrokerOptions = {}): Server[] {
  const socketPath =
    opts.socketPath ?? process.env.SOCKET_PATH ?? DEFAULT_SOCKET_PATH;
  const tcpPort =
    opts.tcpPort ??
    parseInt(process.env.TCP_PORT ?? String(DEFAULT_TCP_PORT), 10);
  const tcpHost = opts.tcpHost ?? process.env.TCP_HOST ?? DEFAULT_TCP_HOST;

  const servers: Server[] = [];

  // UNIX socket server
  if (socketPath) {
    const socketDir = path.dirname(socketPath);
    if (!fs.existsSync(socketDir)) {
      fs.mkdirSync(socketDir, { recursive: true });
    }
    // Remove existing socket file
    if (fs.existsSync(socketPath)) {
      fs.unlinkSync(socketPath);
    }
    const unixServer = createServer(handleConnection);
    unixServer.listen(socketPath, () => {
      console.log(`Stream broker UNIX socket listening on ${socketPath}`);
    });
    servers.push(unixServer);
  }

  // TCP server
  const tcpServer = createServer(handleConnection);
  tcpServer.listen(tcpPort, tcpHost, () => {
    console.log(`Stream broker TCP listening on ${tcpHost}:${tcpPort}`);
  });
  servers.push(tcpServer);

  return servers;
}

export function stopBroker(servers: Server[]): Promise<void[]> {
  return Promise.all(
    servers.map(
      (s) =>
        new Promise<void>((resolve) => {
          s.close(() => resolve());
        }),
    ),
  );
}

// Only bind ports/sockets when run as the daemon entrypoint — importing this
// module (e.g. from tests) must stay side-effect free.
if (import.meta.main) {
  const servers = startBroker();

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("Stream broker shutting down...");
    let pending = servers.length;
    if (pending === 0) process.exit(0);
    for (const s of servers) {
      s.close(() => {
        if (--pending === 0) process.exit(0);
      });
    }
  });
}
