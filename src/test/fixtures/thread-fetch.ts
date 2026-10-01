// Preloaded only in the test server subprocess: no requests reach Ed.
const statuses = [
  { is_seen: false, new_reply_count: 0 },
  { is_seen: true, new_reply_count: 2 },
  { is_seen: true, new_reply_count: 0 },
  {},
];

globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin !== "https://us.edstem.org" ||
      url.pathname !== "/api/courses/1/threads" || init?.method !== "GET") {
    throw new Error(`Unexpected test request: ${url}`);
  }
  return new Response(JSON.stringify({
    threads: statuses.map((status, index) => ({
      id: index + 1,
      number: index + 1,
      title: `Example thread ${index + 1}`,
      category: "General",
      subcategory: "",
      reply_count: 3,
      ...status,
    })),
  }), { status: 200 });
};
