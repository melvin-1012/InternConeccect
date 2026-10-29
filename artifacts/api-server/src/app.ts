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
  path.resolve(process.cwd(), "artifacts/internconnect/dist/public"),
  path.resolve(process.cwd(), "../internconnect/dist/public"),
  path.resolve(process.cwd(), "dist/public"),
];
const staticDir = possibleStaticDirs.find((dir) => fs.existsSync(dir));

if (staticDir) {
  app.use(express.static(staticDir));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path === "/healthz") {
      return next();
    }
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
