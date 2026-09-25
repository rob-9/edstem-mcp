import { it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

for (const name of ["list_threads", "search_threads"]) {
  it(`${name} preserves unread status in MCP responses`, { timeout: 15_000 }, async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [
        "--import", new URL("./fixtures/thread-fetch.js", import.meta.url).href,
        fileURLToPath(new URL("../index.js", import.meta.url)),
      ],
      env: { ED_API_TOKEN: "synthetic-test-token", ED_REGION: "us" },
      stderr: "pipe",
    });
    const client = new Client({ name: "thread-status-test", version: "1.0.0" });
    try {
      await client.connect(transport);
      const result = await client.callTool({
        name,
        arguments: { course_id: 1, ...(name === "search_threads" ? { query: "Example" } : {}) },
      });
      assert.notEqual(result.isError, true);
      const content = result.content as Array<{ type: string; text?: string }>;
      assert.equal(content[0].type, "text");
      const threads = JSON.parse(content[0].text!) as Array<Record<string, unknown>>;
      assert.equal(threads.length, 4);
      assert.deepEqual(threads.slice(0, 3).map(t => [t.is_seen, t.new_reply_count]), [
        [false, 0], [true, 2], [true, 0],
      ]);
      assert.deepEqual(
        threads.filter(t => t.is_seen === false || Number(t.new_reply_count) > 0).map(t => t.id),
        [1, 2],
      );
      // Missing API fields must not become a fabricated "read" status.
      assert.equal(Object.hasOwn(threads[3], "is_seen"), false);
      assert.equal(Object.hasOwn(threads[3], "new_reply_count"), false);
    } finally {
      await client.close();
    }
  });
}
