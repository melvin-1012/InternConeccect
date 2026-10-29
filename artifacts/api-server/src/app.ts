import express, { type Express } from "express";
import path from "path";
import fs from "fs";
import cors from "cors";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.get("/healthz", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", router);

const possibleStaticDirs = [
  path.resolve(process.cwd(), "artifacts/api-server/dist/public"),
  path.resolve(process.cwd(), "artifacts/internconnect/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
  path.resolve(process.cwd(), "../internconnect/dist/public"),
  typeof import.meta.dirname !== "undefined"
    ? path.resolve(import.meta.dirname, "public")
    : null,
].filter(Boolean) as string[];

const staticDir = possibleStaticDirs.find((dir) => fs.existsSync(dir));

if (staticDir) {
  console.log("[InternConnect] Serving static frontend from:", staticDir);
  app.use(express.static(staticDir));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api") || req.path === "/healthz") {
      return next();
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });
} else {
  console.warn("[InternConnect] Static frontend directory not found. Checked:", possibleStaticDirs);
  app.get("/", (_req, res) => {
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head><title>InternConnect API Server</title></head>
        <body style="font-family: sans-serif; padding: 40px; text-align: center;">
          <h2>InternConnect API Server is Running!</h2>
          <p>Status: Healthy (200 OK)</p>
          <p>Note: Frontend build was not detected. Please ensure <code>pnpm run build</code> was executed during deployment.</p>
        </body>
      </html>
    `);
  });
}

export default app;
