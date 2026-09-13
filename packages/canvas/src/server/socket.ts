import { WebSocketServer } from "ws";
import type { Server } from "node:http";
import type { DesignFolderChange } from "@beziera/core";

/**
 * Broadcasts design-folder change events to every connected canvas tab, over
 * a plain WebSocket at /ws on the same HTTP server. This and the design
 * folder are the entire hot-reload mechanism — there is no polling.
 */
export class CanvasSocket {
  private readonly wss: WebSocketServer;

  constructor(httpServer: Server) {
    this.wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  }

  broadcast(change: DesignFolderChange): void {
    const payload = JSON.stringify(change);
    for (const client of this.wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.wss.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
