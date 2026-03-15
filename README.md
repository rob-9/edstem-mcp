# edstem-mcp

MCP server for [Ed Discussion](https://edstem.org) — expose Ed's full API to Claude and other MCP clients.

## Setup

```bash
npm install
npm run build
```

Set your API token (get one at https://edstem.org/us/settings/api-tokens):

```bash
export ED_API_TOKEN=your_token
export ED_REGION=us  # optional: us (default), au, etc.
```

## Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "edstem": {
      "command": "node",
      "args": ["/path/to/edstem-mcp/dist/index.js"],
      "env": {
        "ED_API_TOKEN": "your_token"
      }
    }
  }
}
```

## Tools (22)

| Tool | Description |
|------|-------------|
| `get_user` | Get authenticated user info and enrolled courses |
| `list_threads` | List threads in a course (sortable, paginated) |
| `get_thread` | Get thread by global ID with comments |
| `get_course_thread` | Get thread by course-local number (the # in the UI) |
| `search_threads` | Search threads by title/content keywords |
| `post_thread` | Create a new thread (supports markdown input) |
| `edit_thread` | Edit an existing thread |
| `lock_thread` | Lock a thread |
| `unlock_thread` | Unlock a thread |
| `pin_thread` | Pin a thread |
| `unpin_thread` | Unpin a thread |
| `endorse_thread` | Endorse a thread |
| `unendorse_thread` | Remove thread endorsement |
| `star_thread` | Star/bookmark a thread |
| `unstar_thread` | Remove star |
| `post_comment` | Post a comment or answer on a thread |
| `reply_to_comment` | Reply to an existing comment |
| `endorse_comment` | Endorse a comment |
| `unendorse_comment` | Remove comment endorsement |
| `accept_answer` | Accept a comment as the answer |
| `list_users` | List course roster (staff/admin) |
| `list_user_activity` | List a user's threads and comments |
| `upload_file_from_url` | Upload a file to Ed from a URL |
| `format_content` | Preview markdown → Ed XML conversion |

## Resources (2)

| Resource | URI | Description |
|----------|-----|-------------|
| User Info | `edstem://user` | Authenticated user details |
| Courses | `edstem://courses` | Enrolled courses list |

## Content Format

Thread and comment content uses Ed's XML document format. This server **auto-converts markdown to Ed XML**, so you can write content naturally:

```markdown
# Heading
**Bold** and *italic* text with `inline code`

- Bullet list
- Items

1. Numbered
2. List

> [!info] This becomes an Ed callout

```python
print("code blocks work too")
```‎
```

Pass raw Ed XML (starting with `<document`) to bypass conversion.
