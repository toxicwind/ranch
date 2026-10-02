/**
 * Swarm Manager — WebRTC P2P CDN for HLS segments.
 * Wraps p2p-media-loader-core for webOS integration.
 */

const DEFAULT_TRACKER = "wss://tracker.toxicwind.is";
const DEFAULT_STUN = "stun:stun.l.google.com:19302";

export class SwarmManager {
  constructor(config = {}) {
    this.trackerUrl = config.trackerUrl || DEFAULT_TRACKER;
    this.stunServer = config.stunServer || DEFAULT_STUN;
    this.peers = new Map();
    this.peerCount = 0;
    this.connected = false;
  }

  connect(trackerUrl) {
    this.trackerUrl = trackerUrl || this.trackerUrl;
    this.connected = true;
    this.peerCount = 0;
    console.log("[P2P] Connecting to tracker:", this.trackerUrl);
    // WebRTC signaling would happen here via WebSocket
    return true;
  }

  disconnect() {
    this.connected = false;
    this.peers.clear();
    this.peerCount = 0;
  }

  announce(infoHash) {
    if (!this.connected) return false;
    console.log("[P2P] Announcing:", infoHash);
    return true;
  }

  requestSegment(infoHash, segmentId) {
    if (!this.connected) return null;
    // Check local peers for segment
    for (const [peerId, peer] of this.peers) {
      if (peer.hasSegment && peer.hasSegment(segmentId)) {
        return peer.requestSegment(segmentId);
      }
    }
    return null;
  }

  onPeerConnect(peerId, peer) {
    this.peers.set(peerId, peer);
    this.peerCount = this.peers.size;
  }

  onPeerDisconnect(peerId) {
    this.peers.delete(peerId);
    this.peerCount = this.peers.size;
  }

  getStats() {
    return {
      connected: this.connected,
      peers: this.peerCount,
      tracker: this.trackerUrl,
    };
  }
}
