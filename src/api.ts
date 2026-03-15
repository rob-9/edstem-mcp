/**
 * EdStem API client — direct HTTP calls with fetch.
 */
import type {
  EdActivityItem,
  EdAnalyticsUser,
  EdComment,
  EdEditThreadParams,
  EdFileResponse,
  EdGetThreadResponse,
  EdListThreadsResponse,
  EdPostThreadParams,
  EdThread,
  EdUserResponse,
} from "./types.js";

export class EdApiError extends Error {
  constructor(
    public status: number,
    public body: string,
    message: string
  ) {
    super(message);
    this.name = "EdApiError";
  }
}

export class EdApiClient {
  private baseUrl: string;
  private token: string;
  private staticFileBaseUrl: string;

  constructor(token: string, region = "us") {
    // Validate region to prevent host injection (only allow short alphanumeric codes)
    if (!/^[a-z]{2,5}$/i.test(region)) {
      throw new Error(`Invalid region "${region}": must be 2-5 letters (e.g. "us", "au")`);
    }
    this.token = token;
    this.baseUrl = `https://${region}.edstem.org/api/`;
    this.staticFileBaseUrl = `https://static.${region}.edusercontent.com/files/`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string | number>
  ): Promise<T> {
    const urlObj = new URL(path, this.baseUrl);
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        urlObj.searchParams.set(k, String(v));
      }
    }
    const url = urlObj.toString();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    if (body) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      let errorBody: string;
      try {
        errorBody = await response.text();
      } catch {
        errorBody = "(could not read response body)";
      }
      // Truncate long error bodies and redact anything that looks like a token
      const safeBody = errorBody
        .slice(0, 500)
        .replace(/Bearer\s+[^\s"]+/gi, "Bearer [REDACTED]");
      throw new EdApiError(
        response.status,
        safeBody,
        `Ed API ${method} ${path} failed (${response.status}): ${safeBody}`
      );
    }

    const text = await response.text();
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new EdApiError(
        response.status,
        text.slice(0, 200),
        `Ed API ${method} ${path}: invalid JSON response`
      );
    }
  }

  // ── User ──────────────────────────────────────────────────

  async getUser(): Promise<EdUserResponse> {
    return this.request<EdUserResponse>("GET", "user");
  }

  // ── Threads ───────────────────────────────────────────────

  async listThreads(
    courseId: number,
    opts: { limit?: number; offset?: number; sort?: string } = {}
  ): Promise<EdThread[]> {
    const params: Record<string, string | number> = {};
    if (opts.limit !== undefined) params.limit = opts.limit;
    if (opts.offset !== undefined) params.offset = opts.offset;
    if (opts.sort) params.sort = opts.sort;

    const res = await this.request<EdListThreadsResponse>(
      "GET",
      `courses/${courseId}/threads`,
      undefined,
      params
    );
    return res.threads;
  }

  async getThread(threadId: number): Promise<EdGetThreadResponse> {
    return this.request<EdGetThreadResponse>("GET", `threads/${threadId}`);
  }

  async getCourseThread(
    courseId: number,
    threadNumber: number
  ): Promise<EdGetThreadResponse> {
    return this.request<EdGetThreadResponse>(
      "GET",
      `courses/${courseId}/threads/${threadNumber}`
    );
  }

  async postThread(
    courseId: number,
    params: EdPostThreadParams
  ): Promise<{ thread: EdThread }> {
    return this.request<{ thread: EdThread }>(
      "POST",
      `courses/${courseId}/threads`,
      { thread: params }
    );
  }

  async editThread(
    threadId: number,
    params: EdEditThreadParams
  ): Promise<{ thread: EdThread }> {
    // Fetch current thread to merge fields
    const current = await this.getThread(threadId);
    const merged = { ...current.thread, ...params };
    return this.request<{ thread: EdThread }>("PUT", `threads/${threadId}`, {
      thread: merged,
    });
  }

  // ── Thread actions ────────────────────────────────────────

  async lockThread(threadId: number): Promise<void> {
    await this.request("POST", `threads/${threadId}/lock`);
  }

  async unlockThread(threadId: number): Promise<void> {
    await this.request("POST", `threads/${threadId}/unlock`);
  }

  async pinThread(threadId: number): Promise<void> {
    await this.request("POST", `threads/${threadId}/pin`);
  }

  async unpinThread(threadId: number): Promise<void> {
    await this.request("POST", `threads/${threadId}/unpin`);
  }

  async endorseThread(threadId: number): Promise<void> {
    await this.request("POST", `threads/${threadId}/endorse`);
  }

  async unendorseThread(threadId: number): Promise<void> {
    await this.request("POST", `threads/${threadId}/unendorse`);
  }

  async starThread(threadId: number): Promise<void> {
    await this.request("POST", `threads/${threadId}/star`);
  }

  async unstarThread(threadId: number): Promise<void> {
    await this.request("POST", `threads/${threadId}/unstar`);
  }

  // ── Comments ──────────────────────────────────────────────

  async postComment(
    threadId: number,
    content: string,
    type: "comment" | "answer" = "comment",
    opts: { is_private?: boolean; is_anonymous?: boolean } = {}
  ): Promise<{ comment: EdComment }> {
    return this.request<{ comment: EdComment }>(
      "POST",
      `threads/${threadId}/comments`,
      {
        comment: {
          type,
          content,
          is_private: opts.is_private ?? false,
          is_anonymous: opts.is_anonymous ?? false,
        },
      }
    );
  }

  async replyToComment(
    commentId: number,
    content: string,
    opts: { is_private?: boolean; is_anonymous?: boolean } = {}
  ): Promise<{ comment: EdComment }> {
    return this.request<{ comment: EdComment }>(
      "POST",
      `comments/${commentId}/comments`,
      {
        comment: {
          type: "comment",
          content,
          is_private: opts.is_private ?? false,
          is_anonymous: opts.is_anonymous ?? false,
        },
      }
    );
  }

  async endorseComment(commentId: number): Promise<void> {
    await this.request("POST", `comments/${commentId}/endorse`);
  }

  async unendorseComment(commentId: number): Promise<void> {
    await this.request("POST", `comments/${commentId}/unendorse`);
  }

  async acceptAnswer(threadId: number, commentId: number): Promise<void> {
    await this.request("POST", `threads/${threadId}/accept/${commentId}`);
  }

  // ── User activity ─────────────────────────────────────────

  async listUserActivity(
    userId: number,
    courseId: number,
    opts: { limit?: number; offset?: number; filter?: string } = {}
  ): Promise<EdActivityItem[]> {
    const params: Record<string, string | number> = {
      courseID: courseId,
    };
    if (opts.limit !== undefined) params.limit = opts.limit;
    if (opts.offset !== undefined) params.offset = opts.offset;
    if (opts.filter) params.filter = opts.filter;

    const res = await this.request<{ items: EdActivityItem[] }>(
      "GET",
      `users/${userId}/profile/activity`,
      undefined,
      params
    );
    return res.items ?? [];
  }

  // ── Course users ──────────────────────────────────────────

  async listUsers(courseId: number): Promise<EdAnalyticsUser[]> {
    const res = await this.request<{ users: EdAnalyticsUser[] }>(
      "GET",
      `courses/${courseId}/analytics/users`
    );
    return res.users;
  }

  // ── Files ─────────────────────────────────────────────────

  async uploadFileFromUrl(url: string): Promise<string> {
    // Restrict to HTTPS to mitigate SSRF (block file://, ftp://, internal schemes)
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      throw new Error("Only https:// URLs are allowed for file uploads");
    }
    const res = await this.request<EdFileResponse>("POST", "files/url", { url });
    return `${this.staticFileBaseUrl}${res.file.id}`;
  }
}
