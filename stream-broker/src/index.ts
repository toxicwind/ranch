import { createServer } from "node:net";
import * as fs from "node:fs";
import * as path from "node:path";

const SOCKET_PATH = process.env.SOCKET_PATH || "/run/user/1000/sovereign-stream-broker.sock";
const TCP_PORT = parseInt(process.env.TCP_PORT || "25215", 10);
const TCP_HOST = process.env.TCP_HOST || "127.0.0.1";

// Ensure socket directory exists
const socketDir = path.dirname(SOCKET_PATH);
if (!fs.existsSync(socketDir)) {
  fs.mkdirSync(socketDir, { recursive: true });
}
// Remove existing socket file
if (fs.existsSync(SOCKET_PATH)) {
  fs.unlinkSync(SOCKET_PATH);
}

function handleConnection(socket: net.Socket) {
  console.log(`Stream broker connected: ${socket.remoteAddress}:${socket.remotePort}`);
  socket.setKeepAlive(true, 30000);
  socket.setNoDelay(true);
  
  socket.on("data", (data) => {
    // Echo back for now; in future could buffer tokens
    socket.write(data);
  });
  
  socket.on("end", () => {
    console.log(`Stream broker disconnected: ${socket.remoteAddress}:${socket.remotePort}`);
  });
  
  socket.on("error", (err) => {
    console.error(`Stream broker error:`, err);
  });
}

// UNIX socket server
const unixServer = createServer(handleConnection);
unixServer.listen(SOCKET_PATH, () => {
  console.log(`Stream broker UNIX socket listening on ${SOCKET_PATH}`);
});

// TCP server
const tcpServer = createServer(handleConnection);
tcpServer.listen(TCP_PORT, TCP_HOST, () => {
  console.log(`Stream broker TCP listening on ${TCP_HOST}:${TCP_PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Stream broker shutting down...");
  unixServer.close(() => {
    tcpServer.close(() => {
      process.exit(0);
    });
  });
});