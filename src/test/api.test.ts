import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { EdApiClient, EdApiError } from "../api.js";

// Mock fetch for testing
let fetchCalls: { url: string; init: RequestInit }[] = [];
let mockResponse: { ok: boolean; status: number; text: string } = {
  ok: true,
  status: 200,
  text: "{}",
};

const originalFetch = globalThis.fetch;

function installMockFetch() {
  fetchCalls = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({ url, init: init ?? {} });
    return {
      ok: mockResponse.ok,
      status: mockResponse.status,
      text: async () => mockResponse.text,
    } as Response;
  }) as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

describe("EdApiClient constructor", () => {
  it("builds correct base URL for us region", () => {
    const client = new EdApiClient("tok", "us");
    // We can't read private fields, so test via a request
    assert.ok(client);
  });

  it("rejects invalid region", () => {
    assert.throws(() => new EdApiClient("tok", "evil.com"), /Invalid region/);
  });

  it("rejects numeric region", () => {
    assert.throws(() => new EdApiClient("tok", "123"), /Invalid region/);
  });

  it("rejects empty region", () => {
    assert.throws(() => new EdApiClient("tok", ""), /Invalid region/);
  });

  it("rejects overly long region", () => {
    assert.throws(() => new EdApiClient("tok", "abcdef"), /Invalid region/);
  });

  it("accepts valid short regions", () => {
    assert.doesNotThrow(() => new EdApiClient("tok", "au"));
    assert.doesNotThrow(() => new EdApiClient("tok", "us"));
    assert.doesNotThrow(() => new EdApiClient("tok", "eu"));
  });
});

describe("EdApiClient requests", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("sends auth header", async () => {
    mockResponse = { ok: true, status: 200, text: '{"user":{}}' };
    const client = new EdApiClient("my-token", "us");
    await client.getUser();
    assert.equal(fetchCalls.length, 1);
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer my-token");
  });

  it("sends Accept: application/json", async () => {
    mockResponse = { ok: true, status: 200, text: '{"user":{}}' };
    const client = new EdApiClient("tok", "us");
    await client.getUser();
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    assert.equal(headers["Accept"], "application/json");
  });

  it("constructs correct URL for getUser", async () => {
    mockResponse = { ok: true, status: 200, text: '{"user":{}}' };
    const client = new EdApiClient("tok", "us");
    await client.getUser();
    assert.match(fetchCalls[0].url, /https:\/\/us\.edstem\.org\/api\/user$/);
  });

  it("constructs correct URL for listThreads with params", async () => {
    mockResponse = { ok: true, status: 200, text: '{"threads":[]}' };
    const client = new EdApiClient("tok", "au");
    await client.listThreads(42, { limit: 10, offset: 5, sort: "new" });
    const url = fetchCalls[0].url;
    assert.match(url, /https:\/\/au\.edstem\.org\/api\/courses\/42\/threads/);
    assert.match(url, /limit=10/);
    assert.match(url, /offset=5/);
    assert.match(url, /sort=new/);
  });

  it("constructs correct URL for getCourseThread", async () => {
    mockResponse = { ok: true, status: 200, text: '{"thread":{}}' };
    const client = new EdApiClient("tok", "us");
    await client.getCourseThread(10, 5);
    assert.match(fetchCalls[0].url, /\/courses\/10\/threads\/5$/);
  });

  it("sends JSON body for postThread", async () => {
    mockResponse = { ok: true, status: 200, text: '{"thread":{}}' };
    const client = new EdApiClient("tok", "us");
    await client.postThread(1, {
      type: "post",
      title: "Test",
      category: "General",
      content: "<document>hi</document>",
    });
    const headers = fetchCalls[0].init.headers as Record<string, string>;
    assert.equal(headers["Content-Type"], "application/json");
    const body = JSON.parse(fetchCalls[0].init.body as string);
    assert.equal(body.thread.title, "Test");
  });

  it("throws EdApiError on non-ok response", async () => {
    mockResponse = { ok: false, status: 403, text: '{"error":"forbidden"}' };
    const client = new EdApiClient("tok", "us");
    await assert.rejects(() => client.getUser(), (err: unknown) => {
      assert.ok(err instanceof EdApiError);
      assert.equal(err.status, 403);
      return true;
    });
  });

  it("redacts tokens in error bodies", async () => {
    mockResponse = { ok: false, status: 401, text: 'Bearer abc123secret is invalid' };
    const client = new EdApiClient("tok", "us");
    await assert.rejects(() => client.getUser(), (err: unknown) => {
      assert.ok(err instanceof EdApiError);
      assert.doesNotMatch(err.body, /abc123secret/);
      assert.match(err.body, /\[REDACTED\]/);
      return true;
    });
  });

  it("throws on invalid JSON response", async () => {
    mockResponse = { ok: true, status: 200, text: "not json at all" };
    const client = new EdApiClient("tok", "us");
    await assert.rejects(() => client.getUser(), (err: unknown) => {
      assert.ok(err instanceof EdApiError);
      assert.match(err.message, /invalid JSON/);
      return true;
    });
  });

  for (const ok of [false, true]) {
    it(`redacts credentials in ${ok ? "malformed JSON" : "HTTP error"} responses`, async () => {
      const token = "private-api-token";
      mockResponse = {
        ok,
        status: ok ? 200 : 401,
        text: `Invalid token: ${token}; Authorization: Bearer another-secret`,
      };
      const client = new EdApiClient(token);
      await assert.rejects(() => client.getUser(), (err: unknown) => {
        assert.ok(err instanceof EdApiError);
        assert.doesNotMatch(`${err.body} ${err.message}`, /private-api-token|another-secret/);
        assert.match(err.body, /\[REDACTED\]/);
        return true;
      });
    });
  }

  it("redacts credentials before truncating the response body", async () => {
    mockResponse = { ok: false, status: 401, text: `${"x".repeat(495)}private-api-token` };
    await assert.rejects(() => new EdApiClient("private-api-token").getUser(), (err: unknown) => {
      assert.ok(err instanceof EdApiError);
      assert.ok(err.body.length <= 500);
      assert.doesNotMatch(err.body, /priva/);
      return true;
    });
  });

  it("handles empty response for void endpoints", async () => {
    mockResponse = { ok: true, status: 200, text: "" };
    const client = new EdApiClient("tok", "us");
    await assert.doesNotReject(() => client.lockThread(1));
    assert.match(fetchCalls[0].url, /\/threads\/1\/lock$/);
    assert.equal(fetchCalls[0].init.method, "POST");
  });
});

describe("uploadFileFromUrl", () => {
  beforeEach(() => installMockFetch());
  afterEach(() => restoreFetch());

  it("rejects non-HTTPS URLs", async () => {
    const client = new EdApiClient("tok", "us");
    await assert.rejects(
      () => client.uploadFileFromUrl("http://example.com/file.png"),
      /Only https:\/\//
    );
    assert.equal(fetchCalls.length, 0);
  });

  it("rejects file:// URLs", async () => {
    const client = new EdApiClient("tok", "us");
    await assert.rejects(
      () => client.uploadFileFromUrl("file:///etc/passwd"),
      /Only https:\/\//
    );
  });

  it("accepts HTTPS URLs and returns static file link", async () => {
    mockResponse = {
      ok: true,
      status: 200,
      text: '{"file":{"id":"abc123","user_id":1,"filename":"f.png","extension":"png","created_at":""}}',
    };
    const client = new EdApiClient("tok", "us");
    const link = await client.uploadFileFromUrl("https://example.com/file.png");
    assert.match(link, /static\.us\.edusercontent\.com\/files\/abc123/);
  });
});
