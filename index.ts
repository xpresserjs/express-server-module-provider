import type { Express } from "express";
import {
  type HttpServerProviderStructure,
  HttpServerProvider,
} from "@xpresser/server-module/provider.js";
import type { Xpresser } from "@xpresser/framework/xpresser.js";
import File from "@xpresser/framework/classes/File.js";
import { importDefault } from "@xpresser/framework/functions/module.js";
import type { Server } from "http";
import type { Server as HttpServer } from "https";
import moment from "moment";
import { resolve } from "path";

// import {createServer as createHttpsServer} from "https";

/**
 * Add BootCycle types
 */

declare module "@xpresser/framework/engines/BootCycleEngine.js" {
  module BootCycle {
    enum Cycles {
      expressInit = "serverInit",
      http = "http",
      https = "https",
    }
  }
}

class ExpressProvider
  extends HttpServerProvider
  implements HttpServerProviderStructure
{
  app!: Express;
  http: Server | undefined;
  https: HttpServer | undefined;

  private isProduction: boolean = false;

  customBootCycles(): string[] {
    return [
      // list of boot cycles available on this module
      "expressInit",
      "http",
      "https",
    ];
  }

  async init($: Xpresser) {
    // import express
    const { default: express } = await import("express");

    this.isProduction = $.config.data.env === "production";
    const paths = $.config.data.paths;
    const isUnderMaintenance = File.exists($.path.base(".maintenance"));

    // initialize express
    this.app = express();

    /**
     * HttpToHttps Enforcer.
     * This has to be the first middleware because we need the redirect to run before every other request does.
     */
    const forceHttpToHttps = $.config.get("server.ssl.forceHttpToHttps", false);
    if (forceHttpToHttps) {
      this.app.use((req, res, next) => {
        const isSecure =
          req.headers["x-forwarded-proto"] === "https" || req.secure;

        if (isSecure) return next();

        let newUrl = `${req.protocol}://${req.hostname}${req.url}`;
        newUrl = newUrl.replace("http://", "https://");

        return res.redirect(newUrl);
      });
    }

    /**
     * If {server.poweredBy=true}
     * Set X-Powered-By to Xpresser.
     * Else
     * Disable poweredBy header.
     */
    let poweredBy = $.config.get("server.poweredBy");
    if (poweredBy) {
      poweredBy = typeof poweredBy === "string" ? poweredBy : "Xpresser";
      const overrideServerName = $.config.get("response.overrideServerName");

      this.app.use((_req, res, next) => {
        res.set("X-Powered-By", poweredBy);
        if (overrideServerName) res.set("Server", poweredBy);
        next();
      });
    } else {
      this.app.disable("x-powered-by");
    }

    /**
     * Serve Public folder as static
     */
    const servePublicFolder = $.config.get("server.servePublicFolder", false);
    if (!isUnderMaintenance && servePublicFolder && paths.public) {
      const servePublicFolderOption = $.config.get(
        "server.servePublicFolderOption",
        undefined
      );
      this.app.use(express.static(paths.public, servePublicFolderOption));
    }

    /**
     * Cross-origin resource sharing (CORS) is a mechanism
     * that allows restricted resources on a web page to be requested
     * from another domain outside the domain from which the first resource was served.
     *
     * Read more https://expressjs.com/en/resources/middleware/cors.html
     *
     * By default, Cors is disabled,
     * if you don't define a config @ {server.use.cors}
     */
    const useCors = $.config.get("server.use.cors", false);
    if (useCors) {
      const { default: cors } = await import("cors");
      const corsConfig = $.config.get("packages.cors.config", undefined);
      this.app.use(cors(corsConfig));
    }

    /**
     * BodyParser
     * Parse incoming request bodies in a middleware before your handlers,
     * available under the req.body property.
     *
     * Read More https://expressjs.com/en/resources/middleware/body-parser.html
     *
     * BodyParser is enabled by default
     */
    const useBodyParser = $.config.data.server?.use?.bodyParser;
    if (useBodyParser) {
      const { default: bodyParser } = await import("body-parser");
      const bodyParserJsonConfig = $.config.get("packages.body-parser.json");
      const bodyParserUrlEncodedConfig = $.config.get(
        "packages.body-parser.urlencoded",
        { extended: true }
      );

      this.app.use(bodyParser.json(bodyParserJsonConfig));
      this.app.use(bodyParser.urlencoded(bodyParserUrlEncodedConfig));

      /**
       * Skip Bad Json Error
       */
      this.app.use((err: any, req: any, res: any, next: any) => {
        if (err && err["type"] && err["type"] === "entity.parse.failed") {
          // Skip Entity Errors
          return next();
        }

        return next(err);
      });
    }

    /**
     * Set Express View Engine from config
     */
    const template = $.config.get("template");
    if (template) {
      if (typeof template.engine === "function") {
        this.app.engine(template.extension, template.engine);
        this.app.set("view engine", template.extension);
      } else {
        if (typeof template.use === "string") {
          const module = await importDefault<any>(() => import(template.use));
          this.app.use(module);
        } else if (typeof template.use === "function") {
          this.app.use(template.use);
        } else {
          this.app.set("view engine", template.engine);
        }
      }

      this.app.set("views", $.path.smartPath("views://"));
    }

    /**
     * Convert Empty String to Null
     */
    const convertBodyEmptyStringToNull = $.config.get(
      "server.convertBodyEmptyStringToNull",
      true
    );
    if (convertBodyEmptyStringToNull) {
      this.app.use((req, _res, next) => {
        if (req.body && Object.keys(req.body).length) {
          // loop through body and convert empty strings to null
          for (const [key, value] of Object.entries(req.body)) {
            if (typeof value === "string" && value.trim() === "") {
              req.body[key] = null;
            }
          }
        }

        return next();
      });
    }

    // Run expressInit event
    await $.runBootCycle("expressInit");
  }

  async boot($: Xpresser) {
    // import createServer as createHttpServer
    const { createServer: createHttpServer } = await import("http");

    // Create http server
    this.http = createHttpServer(this.app);

    // Run http event
    await $.runBootCycle("http");

    // get server port
    const port = $.config.data.server?.port || 80;

    const { default: ServerEngine } = await import(
      "@xpresser/server-module/engines/ServerEngine.js"
    );

    // Start Server
    await new Promise((resolve, reject) => {
      this.http!.on("error", (err: any) => {
        if (err["errno"] === "EADDRINUSE") {
          return $.console.logErrorAndExit(
            `Port ${err["port"]} is already in use.`
          );
        }

        return reject(err);
      });

      this.http!.listen(port, async () => {
        const serverDomainAndPort = $.config.get("log.serverDomainAndPort");
        const domain = $.config.getTyped("server.domain");
        const serverEngine = $.engine(ServerEngine);
        const baseUrl = serverEngine.url().trim();
        const lanIp = $.engineData.get("lanIp");
        const ServerStarted = new Date();

        const getServerUptime = () => moment(ServerStarted).fromNow();

        if (serverDomainAndPort || baseUrl === "" || baseUrl === "/") {
          $.console.log(
            `Domain: ${domain} | Port: ${port} | BaseUrl: ${baseUrl}`
          );
        } else {
          $.console.log(`Url: ${baseUrl}`);
        }

        /**
         * Show Lan Ip in development mood
         */
        if (!this.isProduction && lanIp)
          $.console.log(`Network: http://${lanIp}:${port}/`);

        /**
         * Show Server Started Time only on production
         */
        if (this.isProduction)
          $.console.log(`Server started - ${ServerStarted.toString()}`);

        // Save values to engineData
        $.engineData.set({
          ServerStarted,
          getServerUptime,
        });

        const hasSslEnabled = $.config.get("server.ssl.enabled", false);
        if (hasSslEnabled) await this.startHttpsServer($);

        resolve(true);
      });
    });
  }

  async startHttpsServer($: Xpresser) {
    // import createServer as createHttpServer
    const { createServer: createHttpsServer } = await import("https");

    if (!$.config.has("server.ssl.files")) {
      $.console.logErrorAndExit(
        "Ssl enabled but has no {server.ssl.files} config found."
      );
    }

    const files = $.config.get<{
      key: string;
      cert: string;
    }>("server.ssl.files");

    // noinspection SuspiciousTypeOfGuard
    if (typeof files.key !== "string" || typeof files.cert !== "string") {
      $.console.logErrorAndExit(
        "Config {server.ssl.files} not configured properly!"
      );
    }

    if (!files.key.length || !files.cert.length) {
      $.console.logErrorAndExit(
        "Config {server.ssl.files} not configured properly!"
      );
    }

    files.key = resolve(files.key);
    files.cert = resolve(files.cert);

    if (!File.exists(files.key)) {
      $.console.logErrorAndExit("Key file {" + files.key + "} not found!");
    }

    if (!File.exists(files.cert)) {
      $.console.logErrorAndExit("Cert file {" + files.key + "} not found!");
    }

    files.key = File.read(files.key).toString();
    files.cert = File.read(files.cert).toString();

    this.https = createHttpsServer(files, this.app);

    // Run https event
    await $.runBootCycle("https");

    const httpsPort = $.config.get("server.ssl.port", 443);

    // Start Server
    await new Promise((resolve) => {
      this.https!.on("error", $.console.logError);

      this.https!.listen(httpsPort, () => {
        $.console.logSuccess("Ssl Enabled.");
        resolve(true);
      });
    });
  }
}

export default ExpressProvider;
