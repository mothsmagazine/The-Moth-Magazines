const SESSION_COOKIE_NAME = "admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin");
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
    Vary: "Origin",
  };
}

function getCookie(request, cookieName) {
  const rawCookie = request.headers.get("Cookie") || "";
  const parts = rawCookie.split(";");
  for (const part of parts) {
    const [name, ...rest] = part.trim().split("=");
    if (name === cookieName) {
      return rest.join("=");
    }
  }
  return null;
}

function base64UrlEncode(bytes) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input) {
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4 || 4)) % 4);
  const binary = atob(padded);
  return new Uint8Array([...binary].map((char) => char.charCodeAt(0)));
}

async function hmacSign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(new Uint8Array(signatureBuffer));
}

async function createSessionToken(secret) {
  const payload = {
    exp: Date.now() + SESSION_TTL_SECONDS * 1000,
    nonce: crypto.randomUUID(),
  };

  const payloadB64 = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSign(payloadB64, secret);
  return `${payloadB64}.${signature}`;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

async function verifySessionToken(token, secret) {
  if (!token || typeof token !== "string") return false;
  const [payloadB64, signature] = token.split(".");
  if (!payloadB64 || !signature) return false;

  const expectedSignature = await hmacSign(payloadB64, secret);
  if (!timingSafeEqual(signature, expectedSignature)) {
    return false;
  }

  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
    if (!payload?.exp || payload.exp < Date.now()) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function buildSessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAgeSeconds}`;
}

function unauthorized(corsHeaders) {
  return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 404 });
    }

    const corsHeaders = getCorsHeaders(request);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
      // ──────────── AUTH ────────────
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        if (!env.ADMIN_PASSWORD || !env.ADMIN_SESSION_SECRET) {
          return Response.json(
            { error: "Admin auth is not configured" },
            { status: 500, headers: corsHeaders }
          );
        }

        const { password } = await request.json();
        if (!password || password !== env.ADMIN_PASSWORD) {
          return unauthorized(corsHeaders);
        }

        const token = await createSessionToken(env.ADMIN_SESSION_SECRET);
        const headers = new Headers(corsHeaders);
        headers.append("Set-Cookie", buildSessionCookie(token, SESSION_TTL_SECONDS));

        return Response.json({ success: true }, { headers });
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        const headers = new Headers(corsHeaders);
        headers.append("Set-Cookie", buildSessionCookie("", 0));
        return Response.json({ success: true }, { headers });
      }

      if (url.pathname === "/api/auth/session" && request.method === "GET") {
        if (!env.ADMIN_SESSION_SECRET) {
          return Response.json({ authenticated: false }, { headers: corsHeaders });
        }

        const token = getCookie(request, SESSION_COOKIE_NAME);
        const authenticated = await verifySessionToken(token, env.ADMIN_SESSION_SECRET);
        return Response.json({ authenticated }, { headers: corsHeaders });
      }

      const isProtectedRoute =
        (url.pathname === "/api/images" && request.method === "POST") ||
        (url.pathname === "/api/posts" && request.method === "POST") ||
        (url.pathname.match(/^\/api\/posts\/[^/]+$/) && ["PUT", "DELETE"].includes(request.method));

      if (isProtectedRoute) {
        if (!env.ADMIN_SESSION_SECRET) {
          return Response.json(
            { error: "Admin auth is not configured" },
            { status: 500, headers: corsHeaders }
          );
        }

        const token = getCookie(request, SESSION_COOKIE_NAME);
        const authenticated = await verifySessionToken(token, env.ADMIN_SESSION_SECRET);
        if (!authenticated) {
          return unauthorized(corsHeaders);
        }
      }

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
                  pivotColor:
                    typeof flashPresentation.pivotColor === "string" && flashPresentation.pivotColor.trim()
                      ? flashPresentation.pivotColor
                      : "#ec4899",
                  wordColor:
                    typeof flashPresentation.wordColor === "string" && flashPresentation.wordColor.trim()
                      ? flashPresentation.wordColor
                      : "#f3f4f6",
                  wordStyles:
                    flashPresentation.wordStyles && typeof flashPresentation.wordStyles === "object"
                      ? flashPresentation.wordStyles
                      : {},
                }
              : { version: 1, wpm: 300, pivotColor: "#ec4899", wordColor: "#f3f4f6", wordStyles: {} },
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
                  pivotColor:
                    typeof oldPost.flashPresentation?.pivotColor === "string" &&
                    oldPost.flashPresentation.pivotColor.trim()
                      ? oldPost.flashPresentation.pivotColor
                      : "#ec4899",
                  wordColor:
                    typeof oldPost.flashPresentation?.wordColor === "string" &&
                    oldPost.flashPresentation.wordColor.trim()
                      ? oldPost.flashPresentation.wordColor
                      : "#f3f4f6",
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
                  pivotColor:
                    typeof updates.flashPresentation?.pivotColor === "string" &&
                    updates.flashPresentation.pivotColor.trim()
                      ? updates.flashPresentation.pivotColor
                      : typeof oldPost.flashPresentation?.pivotColor === "string" &&
                          oldPost.flashPresentation.pivotColor.trim()
                        ? oldPost.flashPresentation.pivotColor
                        : "#ec4899",
                  wordColor:
                    typeof updates.flashPresentation?.wordColor === "string" &&
                    updates.flashPresentation.wordColor.trim()
                      ? updates.flashPresentation.wordColor
                      : typeof oldPost.flashPresentation?.wordColor === "string" &&
                          oldPost.flashPresentation.wordColor.trim()
                        ? oldPost.flashPresentation.wordColor
                        : "#f3f4f6",
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
