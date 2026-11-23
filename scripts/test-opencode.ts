import "dotenv/config";
/**
 * Probe OpenCode CLI + free-only routing.
 * Requires `opencode` on PATH (or OPENCODE_CLI).
 */
import { modelRouter } from "../src/backends/router.js";

async function main() {
  console.log("FREE_ONLY:", modelRouter.isFreeOnly());
  console.log("Free models:", modelRouter.listFreeModels());

  const ping = await modelRouter.pingOpenCode();
  console.log("CLI ping:", ping);

  if (!ping.ok) {
    console.error("Install OpenCode CLI: https://opencode.ai  (or set OPENCODE_CLI)");
    process.exit(1);
  }

  try {
    const res = await modelRouter.chat({
      messages: [{ role: "user", content: "Reply with exactly: pong" }],
      preferFree: true,
    });
    console.log("Response model:", res.model);
    console.log("Content:", res.content.slice(0, 300));
  } catch (e: any) {
    console.error("Chat failed:", e.message);
    process.exit(1);
  }
}

main();
