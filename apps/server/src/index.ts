import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {auth} from "./lib/auth"

import { aiRoute } from "./routers/ai";


const app = new Hono<
{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null
	}
}
>();
app.use(logger());
app.use(
  "/*",
  cors({
    origin: process.env.CORS_ORIGIN || "",
    allowMethods: ["GET", "POST", "OPTIONS", "DELETE"],
    allowHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);


app.use("/*", async (c, next) => {
  const path = c.req.path;
  if (path.startsWith("/api/auth/") || path === "/" || path.startsWith("/ai/shared/") || path.startsWith("/ai/comp/stream/")) {
    return next();
  }
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session || !session.user) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  c.set("user", session.user);
  c.set("session", session.session);
  return next();
});
 
app.on(["POST", "GET"], "/api/auth/*", (c) => {
    console.log('Incoming request to /api/auth/*:', c.req.url);
	return auth.handler(c.req.raw);
});

// auth redirect fallback
app.get("/", (c) => {
  const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Redirecting...</title>
        <meta http-equiv="refresh" content="1.5;url=${frontendUrl}">
        <style>
            body {
                background-color: #222222;
                color: #eeeeee; /* Light grey text for readability */
                font-family: sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
            }
            a {
                color: #88ccff; /* A slightly brighter blue for the link */
            }
        </style>
    </head>
    <body>
        <p>Redirecting to your application... If you are not redirected automatically, <a href="${frontendUrl}">click here</a>.</p>
    </body>
    </html>
  `;
  return c.html(htmlContent);
});

app.route('/ai', aiRoute)

if (typeof Bun !== 'undefined') {
  Bun.serve({
    fetch: app.fetch,
    port: 3000,
    idleTimeout: 255, // 1 hour
  });
}

export default app;
