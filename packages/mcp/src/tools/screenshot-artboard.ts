import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { listArtboards, getBrowser, captureHtmlFile, VIEWPORTS, type DesignFolder } from "@beziera/core";

/**
 * `screenshot_artboard` — the quality loop. Render one artboard in a
 * headless, network-blocked browser and return the image, so the agent can
 * see spacing, contrast and layout problems it cannot see in raw HTML.
 *
 * The browser is launched once for this server process (render/browser.ts)
 * and reused across every call — this is the tool an agent is meant to call
 * every turn, and a cold launch per call would be slow enough that it stops
 * getting called.
 */
export function registerScreenshotArtboardTool(server: McpServer, folder: DesignFolder): void {
  server.registerTool(
    "screenshot_artboard",
    {
      title: "Screenshot artboard",
      description:
        "Render one artboard in a headless, network-blocked browser and return a PNG screenshot " +
        "of it, so the agent can see what it actually looks like rather than guess from the HTML. " +
        `Rendered at a declared viewport: "desktop" (${VIEWPORTS.desktop.width}px) or "mobile" ` +
        `(${VIEWPORTS.mobile.width}px). Call this after writing or changing an artboard, before ` +
        "reporting the work done.",
      inputSchema: {
        id: z.string().min(1).describe("The artboard's id, as listed by list_artboards."),
        viewport: z
          .enum(["desktop", "mobile"])
          .default("desktop")
          .describe("Which declared viewport width to render at."),
      },
    },
    async ({ id, viewport }) => {
      const artboards = await listArtboards(folder);
      const artboard = artboards.find((a) => a.id === id);
      if (!artboard || !artboard.exists) {
        throw new Error(`Unknown or missing artboard: ${id}`);
      }

      const browser = await getBrowser();
      const result = await captureHtmlFile(browser, artboard.absolutePath, { viewport });

      return {
        content: [
          {
            type: "image" as const,
            data: result.png.toString("base64"),
            mimeType: "image/png",
          },
          {
            type: "text" as const,
            text:
              `Captured "${id}" at the ${viewport} viewport: ${result.width}x${result.height}px, ` +
              `${Math.round(result.captureMs)}ms.`,
          },
        ],
      };
    }
  );
}
