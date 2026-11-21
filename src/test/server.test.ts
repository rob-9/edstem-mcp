import { it } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

it("exposes the MCP capabilities and formats content over stdio", { timeout: 10_000 }, async () => {
  const client = new Client({ name: "edstem-test", version: "1.0.0" });
  try {
    await client.connect(new StdioClientTransport({
      command: process.execPath,
      args: [fileURLToPath(new URL("../index.js", import.meta.url))],
      env: { ED_API_TOKEN: "local-test-token", ED_REGION: "us" },
    }));
    const { tools } = await client.listTools();
    assert.equal(tools.length, 24);
    assert.equal((await client.listResources()).resources.length, 2);
    assert.equal((await client.listPrompts()).prompts.length, 3);
    const search = tools.find((tool) => tool.name === "search_threads");
    assert.ok(search);
    assert.deepEqual(search.inputSchema.properties?.offset, {
      type: "integer", minimum: 0, default: 0,
      description: "Number of threads to skip before filtering",
    });
    // Ed ignores every sort value except "new" and "trending", so only offer those.
    const list = tools.find((tool) => tool.name === "list_threads");
    assert.ok(list);
    assert.deepEqual((list.inputSchema.properties?.sort as { enum?: string[] }).enum, ["new", "trending", "default"]);
    assert.ok(list.inputSchema.properties?.unanswered_only);
    const result = await client.callTool({ name: "format_content", arguments: { markdown: "**hello**" } });
    assert.ok(!result.isError);
    assert.deepEqual(result.content, [{
      type: "text",
      text: '<document version="2.0"><paragraph><bold>hello</bold></paragraph></document>',
    }]);
  } finally {
    await client.close();
  }
});
