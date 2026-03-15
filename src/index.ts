#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { EdApiClient, EdApiError } from "./api.js";
import type { EdEditThreadParams } from "./types.js";
import { edXmlToPlainText, ensureEdXml, markdownToEdXml } from "./content.js";

// ── Config ──────────────────────────────────────────────────

const token = process.env.ED_API_TOKEN;
if (!token) {
  console.error("ED_API_TOKEN environment variable is required.");
  console.error("Get one at https://edstem.org/us/settings/api-tokens");
  process.exit(1);
}
const region = process.env.ED_REGION ?? "us";
const api = new EdApiClient(token, region);

// ── Server ──────────────────────────────────────────────────

const server = new McpServer({
  name: "edstem",
  version: "1.0.0",
});

function errorText(err: unknown): string {
  if (err instanceof EdApiError) {
    return `Ed API error (${err.status}): ${err.body}`;
  }
  return err instanceof Error ? err.message : String(err);
}

function ok(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function msg(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function fail(err: unknown) {
  return { content: [{ type: "text" as const, text: errorText(err) }], isError: true as const };
}

// ── Resources ───────────────────────────────────────────────

server.resource("user-info", "edstem://user", async (uri) => {
  try {
    const data = await api.getUser();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  } catch (err) {
    throw new Error(errorText(err));
  }
});

server.resource("courses", "edstem://courses", async (uri) => {
  try {
    const data = await api.getUser();
    const courses = data.courses.map((c) => ({
      id: c.course.id,
      code: c.course.code,
      name: c.course.name,
      year: c.course.year,
      session: c.course.session,
      status: c.course.status,
      role: c.role.role,
    }));
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: JSON.stringify(courses, null, 2),
        },
      ],
    };
  } catch (err) {
    throw new Error(errorText(err));
  }
});

// ── Tools: User ─────────────────────────────────────────────

server.tool("get_user", "Get authenticated user info and enrolled courses", {}, async () => {
  try {
    return ok(await api.getUser());
  } catch (err) {
    return fail(err);
  }
});

// ── Tools: Threads ──────────────────────────────────────────

server.tool(
  "list_threads",
  "List discussion threads in a course",
  {
    course_id: z.number().describe("Course ID"),
    limit: z.number().min(1).max(100).default(30).describe("Max threads to return (1-100)"),
    offset: z.number().min(0).default(0).describe("Pagination offset"),
    sort: z
      .enum(["new", "top", "active", "unanswered"])
      .default("new")
      .describe("Sort order"),
  },
  async ({ course_id, limit, offset, sort }) => {
    try {
      const threads = await api.listThreads(course_id, { limit, offset, sort });
      const summary = threads.map((t) => ({
        id: t.id,
        number: t.number,
        type: t.type,
        title: t.title,
        category: t.category,
        subcategory: t.subcategory,
        reply_count: t.reply_count,
        is_answered: t.is_answered,
        is_pinned: t.is_pinned,
        is_private: t.is_private,
        created_at: t.created_at,
        user: t.user,
      }));
      return ok(summary);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_thread",
  "Get a thread by global ID, including all comments and answers",
  {
    thread_id: z.number().describe("Global thread ID"),
  },
  async ({ thread_id }) => {
    try {
      return ok(await api.getThread(thread_id));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "get_course_thread",
  "Get a thread by its course-local number (the # shown in the Ed UI)",
  {
    course_id: z.number().describe("Course ID"),
    thread_number: z.number().describe("Thread number within the course"),
  },
  async ({ course_id, thread_number }) => {
    try {
      return ok(await api.getCourseThread(course_id, thread_number));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "search_threads",
  "Search threads in a course by title or content keywords",
  {
    course_id: z.number().describe("Course ID"),
    query: z.string().describe("Search query"),
    limit: z.number().min(1).max(100).default(50).describe("Max results"),
  },
  async ({ course_id, query, limit }) => {
    try {
      const threads = await api.listThreads(course_id, { limit, sort: "new" });
      const q = query.toLowerCase();
      const matches = threads.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          edXmlToPlainText(t.document ?? "").toLowerCase().includes(q)
      );
      const summary = matches.map((t) => ({
        id: t.id,
        number: t.number,
        type: t.type,
        title: t.title,
        category: t.category,
        reply_count: t.reply_count,
        is_answered: t.is_answered,
        created_at: t.created_at,
      }));
      return ok(summary);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "post_thread",
  "Create a new discussion thread. Content can be markdown (auto-converted to Ed XML).",
  {
    course_id: z.number().describe("Course ID"),
    title: z.string().describe("Thread title"),
    type: z.enum(["post", "question", "announcement"]).default("post").describe("Thread type"),
    category: z.string().describe("Category name"),
    subcategory: z.string().default("").describe("Subcategory name"),
    content: z.string().describe("Thread body (markdown or Ed XML)"),
    is_private: z.boolean().default(false).describe("Private thread"),
    is_anonymous: z.boolean().default(false).describe("Post anonymously"),
    is_pinned: z.boolean().default(false).describe("Pin the thread"),
  },
  async ({ course_id, title, type, category, subcategory, content, is_private, is_anonymous, is_pinned }) => {
    try {
      const result = await api.postThread(course_id, {
        type,
        title,
        category,
        subcategory,
        content: ensureEdXml(content),
        is_private,
        is_anonymous,
        is_pinned,
        is_megathread: false,
        anonymous_comments: false,
      });
      return ok(result);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "edit_thread",
  "Edit an existing thread. Only provided fields are updated.",
  {
    thread_id: z.number().describe("Global thread ID"),
    title: z.string().optional().describe("New title"),
    content: z.string().optional().describe("New body (markdown or Ed XML)"),
    type: z.enum(["post", "question", "announcement"]).optional(),
    category: z.string().optional(),
    subcategory: z.string().optional(),
    is_private: z.boolean().optional(),
    is_anonymous: z.boolean().optional(),
    is_pinned: z.boolean().optional(),
  },
  async ({ thread_id, content, ...rest }) => {
    try {
      const params: EdEditThreadParams = { ...rest };
      if (content !== undefined) {
        params.content = ensureEdXml(content);
      }
      const result = await api.editThread(thread_id, params);
      return ok(result);
    } catch (err) {
      return fail(err);
    }
  }
);

// ── Tools: Thread actions ───────────────────────────────────

for (const [action, desc] of [
  ["lock", "Lock a thread (prevent new replies)"],
  ["unlock", "Unlock a thread"],
  ["pin", "Pin a thread to the top"],
  ["unpin", "Unpin a thread"],
  ["endorse", "Endorse a thread (staff)"],
  ["unendorse", "Remove endorsement from a thread"],
  ["star", "Star/bookmark a thread"],
  ["unstar", "Remove star from a thread"],
] as const) {
  server.tool(
    `${action}_thread`,
    desc,
    { thread_id: z.number().describe("Global thread ID") },
    async ({ thread_id }) => {
      try {
        const fn = api[`${action}Thread` as keyof EdApiClient] as (id: number) => Promise<void>;
        await fn.call(api, thread_id);
        return msg(`Thread ${thread_id} ${action}ed successfully.`);
      } catch (err) {
        return fail(err);
      }
    }
  );
}

// ── Tools: Comments ─────────────────────────────────────────

server.tool(
  "post_comment",
  "Post a comment or answer on a thread. Content can be markdown.",
  {
    thread_id: z.number().describe("Global thread ID"),
    content: z.string().describe("Comment body (markdown or Ed XML)"),
    type: z.enum(["comment", "answer"]).default("comment").describe("Comment or answer"),
    is_private: z.boolean().default(false),
    is_anonymous: z.boolean().default(false),
  },
  async ({ thread_id, content, type, is_private, is_anonymous }) => {
    try {
      const result = await api.postComment(thread_id, ensureEdXml(content), type, {
        is_private,
        is_anonymous,
      });
      return ok(result);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "reply_to_comment",
  "Reply to an existing comment",
  {
    comment_id: z.number().describe("Comment ID to reply to"),
    content: z.string().describe("Reply body (markdown or Ed XML)"),
    is_private: z.boolean().default(false),
    is_anonymous: z.boolean().default(false),
  },
  async ({ comment_id, content, is_private, is_anonymous }) => {
    try {
      const result = await api.replyToComment(comment_id, ensureEdXml(content), {
        is_private,
        is_anonymous,
      });
      return ok(result);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "endorse_comment",
  "Endorse a comment (staff)",
  { comment_id: z.number().describe("Comment ID") },
  async ({ comment_id }) => {
    try {
      await api.endorseComment(comment_id);
      return msg(`Comment ${comment_id} endorsed.`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "unendorse_comment",
  "Remove endorsement from a comment",
  { comment_id: z.number().describe("Comment ID") },
  async ({ comment_id }) => {
    try {
      await api.unendorseComment(comment_id);
      return msg(`Comment ${comment_id} unendorsed.`);
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "accept_answer",
  "Accept a comment as the answer to a question thread",
  {
    thread_id: z.number().describe("Global thread ID"),
    comment_id: z.number().describe("Comment ID to accept"),
  },
  async ({ thread_id, comment_id }) => {
    try {
      await api.acceptAnswer(thread_id, comment_id);
      return msg(`Comment ${comment_id} accepted as answer for thread ${thread_id}.`);
    } catch (err) {
      return fail(err);
    }
  }
);

// ── Tools: Users & Activity ─────────────────────────────────

server.tool(
  "list_users",
  "List all users enrolled in a course (requires staff/admin)",
  { course_id: z.number().describe("Course ID") },
  async ({ course_id }) => {
    try {
      return ok(await api.listUsers(course_id));
    } catch (err) {
      return fail(err);
    }
  }
);

server.tool(
  "list_user_activity",
  "List a user's recent threads and comments in a course",
  {
    user_id: z.number().describe("User ID"),
    course_id: z.number().describe("Course ID"),
    limit: z.number().min(1).max(50).default(30).describe("Max items"),
    offset: z.number().min(0).default(0).describe("Pagination offset"),
    filter: z.enum(["all", "thread", "answer", "comment"]).default("all"),
  },
  async ({ user_id, course_id, limit, offset, filter }) => {
    try {
      return ok(await api.listUserActivity(user_id, course_id, { limit, offset, filter }));
    } catch (err) {
      return fail(err);
    }
  }
);

// ── Tools: Files ────────────────────────────────────────────

server.tool(
  "upload_file_from_url",
  "Upload a file to Ed from a URL, returns the static file link",
  { url: z.string().url().describe("Public URL of the file to upload") },
  async ({ url }) => {
    try {
      const link = await api.uploadFileFromUrl(url);
      return msg(`File uploaded: ${link}`);
    } catch (err) {
      return fail(err);
    }
  }
);

// ── Tools: Content helpers ──────────────────────────────────

server.tool(
  "format_content",
  "Convert markdown text to Ed Discussion XML format (preview, no API call)",
  { markdown: z.string().describe("Markdown text to convert") },
  async ({ markdown }) => {
    return msg(markdownToEdXml(markdown));
  }
);

// ── Start ───────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`edstem-mcp server running (region: ${region})`);
}

main().catch((err) => {
  console.error("Fatal:", err instanceof Error ? err.message : "unexpected error");
  process.exit(1);
});
