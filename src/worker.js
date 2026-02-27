export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Only handle /api/* routes
    if (!url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 404 });
    }

    // CORS headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // ──────────── IMAGE UPLOAD ────────────
      // POST /api/images — upload an image, returns its public URL
      if (url.pathname === "/api/images" && request.method === "POST") {
        const formData = await request.formData();
        const file = formData.get("file");

        if (!file) {
          return Response.json(
            { error: "No file provided" },
            { status: 400, headers: corsHeaders }
          );
        }

        const ext = file.name.split(".").pop() || "bin";
        const key = `images/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

        await env.POSTS_BUCKET.put(key, file.stream(), {
          httpMetadata: { contentType: file.type },
        });

        const imageUrl = `/api/images/${key.replace("images/", "")}`;
        return Response.json({ success: true, url: imageUrl }, { status: 201, headers: corsHeaders });
      }

      // GET /api/images/:filename — serve an image
      const imgMatch = url.pathname.match(/^\/api\/images\/(.+)$/);
      if (imgMatch && request.method === "GET") {
        const object = await env.POSTS_BUCKET.get(`images/${imgMatch[1]}`);
        if (!object) {
          return new Response("Not found", { status: 404, headers: corsHeaders });
        }
        const headers = new Headers(corsHeaders);
        headers.set("Content-Type", object.httpMetadata?.contentType || "application/octet-stream");
        headers.set("Cache-Control", "public, max-age=31536000, immutable");
        return new Response(object.body, { headers });
      }

      // ──────────── POSTS CRUD ────────────

      // POST /api/posts — create a new post
      if (url.pathname === "/api/posts" && request.method === "POST") {
        const { title, author, body, flashPresentation } = await request.json();

        if (!title || !body) {
          return Response.json(
            { error: "Title and body are required" },
            { status: 400, headers: corsHeaders }
          );
        }

        const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        const post = {
          id,
          title: title.trim(),
          author: (author || "Anonymous").trim(),
          body, // keep raw (may contain image markdown/html)
          flashPresentation:
            flashPresentation && typeof flashPresentation === "object"
              ? {
                  version: 1,
                  wpm:
                    Number.isFinite(Number(flashPresentation.wpm)) && Number(flashPresentation.wpm) > 0
                      ? Number(flashPresentation.wpm)
                      : 300,
                  wordStyles:
                    flashPresentation.wordStyles && typeof flashPresentation.wordStyles === "object"
                      ? flashPresentation.wordStyles
                      : {},
                }
              : { version: 1, wpm: 300, wordStyles: {} },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await env.POSTS_BUCKET.put(`posts/${id}.json`, JSON.stringify(post), {
          httpMetadata: { contentType: "application/json" },
          customMetadata: { title: post.title, author: post.author, createdAt: post.createdAt },
        });

        return Response.json({ success: true, post }, { status: 201, headers: corsHeaders });
      }

      // GET /api/posts — list all posts (metadata only)
      if (url.pathname === "/api/posts" && request.method === "GET") {
        const listed = await env.POSTS_BUCKET.list({ prefix: "posts/" });

        const posts = (
          await Promise.all(
            listed.objects
              .filter((obj) => obj.key.endsWith(".json"))
              .map(async (obj) => {
                const id = obj.key.replace("posts/", "").replace(".json", "");
                const stored = await env.POSTS_BUCKET.get(obj.key);

                if (!stored) {
                  return null;
                }

                const post = await stored.json();

                return {
                  id,
                  title: post.title || "Untitled",
                  author: post.author || "Anonymous",
                  createdAt: post.createdAt || obj.uploaded.toISOString(),
                };
              })
          )
        ).filter(Boolean);

        // Sort newest first
        posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return Response.json({ posts }, { headers: corsHeaders });
      }

      // Match /api/posts/:id for GET, PUT, DELETE
      const postMatch = url.pathname.match(/^\/api\/posts\/([^/]+)$/);

      // GET /api/posts/:id — get a single post
      if (postMatch && request.method === "GET") {
        const id = postMatch[1];
        const object = await env.POSTS_BUCKET.get(`posts/${id}.json`);

        if (!object) {
          return Response.json(
            { error: "Post not found" },
            { status: 404, headers: corsHeaders }
          );
        }

        const post = await object.json();
        return Response.json({ post }, { headers: corsHeaders });
      }

      // PUT /api/posts/:id — update an existing post
      if (postMatch && request.method === "PUT") {
        const id = postMatch[1];
        const existing = await env.POSTS_BUCKET.get(`posts/${id}.json`);

        if (!existing) {
          return Response.json(
            { error: "Post not found" },
            { status: 404, headers: corsHeaders }
          );
        }

        const oldPost = await existing.json();
        const updates = await request.json();

        const post = {
          ...oldPost,
          title: (updates.title ?? oldPost.title).trim(),
          author: (updates.author ?? oldPost.author).trim(),
          body: updates.body ?? oldPost.body,
          flashPresentation:
            updates.flashPresentation === undefined
              ? {
                  version: 1,
                  wpm:
                    Number.isFinite(Number(oldPost.flashPresentation?.wpm)) &&
                    Number(oldPost.flashPresentation?.wpm) > 0
                      ? Number(oldPost.flashPresentation.wpm)
                      : 300,
                  wordStyles:
                    oldPost.flashPresentation?.wordStyles &&
                    typeof oldPost.flashPresentation.wordStyles === "object"
                      ? oldPost.flashPresentation.wordStyles
                      : {},
                }
              : {
                  version: 1,
                  wpm:
                    Number.isFinite(Number(updates.flashPresentation?.wpm)) &&
                    Number(updates.flashPresentation.wpm) > 0
                      ? Number(updates.flashPresentation.wpm)
                      : Number.isFinite(Number(oldPost.flashPresentation?.wpm)) &&
                          Number(oldPost.flashPresentation?.wpm) > 0
                        ? Number(oldPost.flashPresentation.wpm)
                        : 300,
                  wordStyles:
                    updates.flashPresentation?.wordStyles &&
                    typeof updates.flashPresentation.wordStyles === "object"
                      ? updates.flashPresentation.wordStyles
                      : {},
                },
          updatedAt: new Date().toISOString(),
        };

        await env.POSTS_BUCKET.put(`posts/${id}.json`, JSON.stringify(post), {
          httpMetadata: { contentType: "application/json" },
          customMetadata: { title: post.title, author: post.author, createdAt: post.createdAt },
        });

        return Response.json({ success: true, post }, { headers: corsHeaders });
      }

      // DELETE /api/posts/:id — delete a post
      if (postMatch && request.method === "DELETE") {
        const id = postMatch[1];
        await env.POSTS_BUCKET.delete(`posts/${id}.json`);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    } catch (err) {
      return Response.json(
        { error: "Internal server error", details: err.message },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
