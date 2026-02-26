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
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // POST /api/posts — create a new post
      if (url.pathname === "/api/posts" && request.method === "POST") {
        const { title, author, body } = await request.json();

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
          body: body.trim(),
          createdAt: new Date().toISOString(),
        };

        await env.POSTS_BUCKET.put(`posts/${id}.json`, JSON.stringify(post), {
          httpMetadata: { contentType: "application/json" },
          customMetadata: { title: post.title, author: post.author, createdAt: post.createdAt },
        });

        return Response.json({ success: true, post }, { status: 201, headers: corsHeaders });
      }

      // GET /api/posts — list all posts
      if (url.pathname === "/api/posts" && request.method === "GET") {
        const listed = await env.POSTS_BUCKET.list({ prefix: "posts/" });

        const posts = listed.objects.map((obj) => ({
          id: obj.key.replace("posts/", "").replace(".json", ""),
          title: obj.customMetadata?.title || "Untitled",
          author: obj.customMetadata?.author || "Anonymous",
          createdAt: obj.customMetadata?.createdAt || obj.uploaded.toISOString(),
        }));

        // Sort newest first
        posts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        return Response.json({ posts }, { headers: corsHeaders });
      }

      // GET /api/posts/:id — get a single post
      const postMatch = url.pathname.match(/^\/api\/posts\/(.+)$/);
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

      return Response.json({ error: "Not found" }, { status: 404, headers: corsHeaders });
    } catch (err) {
      return Response.json(
        { error: "Internal server error", details: err.message },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};
