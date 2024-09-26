import { resolve } from "node:path";
import type { Server } from "node:http";
import type { Server as HttpServer } from "node:https";
import type { Express, Request, Response } from "express";
import {
    HttpServerProvider,
    type HttpServerProviderStructure,
    OnHttpListen
} from "@xpresser/server-module/provider.js";
import File from "@xpresser/framework/classes/File.js";
import { importDefault } from "@xpresser/framework/functions/module.js";
import { RegisterServerModule } from "@xpresser/server-module/index.js";
import { type Xpresser, BootCycleFunction } from "@xpresser/framework";
import XpresserRouter from "@xpresser/server-module/router/index.js";
import ExpressRequestEngine from "./src/ExpressRequestEngine.js";
import { RouteData } from "@xpresser/server-module/router/RouterRoute.js";
import RouterService from "@xpresser/server-module/router/RouterService.js";
import { RouterReqHandlerFunction } from "./src/ExpressRequestEngine.js";
import { RequestEngine } from "@xpresser/server-module/engines/RequestEngine.js";

/**
 * Provider Configuration
 */
export interface ExpressProviderConfig {
    /**
     * Request Handler
     * - `express` uses the native express request handler
     * - `xpresser` uses the xpresser request handler
     *
     * @default "xpresser"
     * @example
     * // If requestHandler is set to `native`
     * router.get("/", (req, res) => {
     *     res.end(`Your url is ${req.url}`);
     * })
     *
     * // If requestHandler is set to `xpresser`
     * router.get("/", (http) => {
     *     http.send(`Your url is ${http.req.url}`);
     * })
     */
    requestHandler: "express" | "xpresser";
}

/**
 *  ReqHandlerFunction - Request Handler Function
 *  This is the type of function used in routes
 */
export type ReqHandlerFunction = (req: Request, res: Response) => void;

/**
 * Express Provider
 * This provider is used to create an express server.
 */
export default class ExpressProvider
    extends HttpServerProvider
    implements HttpServerProviderStructure
{
    static config = {
        name: "Xpresser/ExpressProvider"
    };

    /**
     * Express App - undefined until `expressInit` boot cycle.
     */
    app!: Express;

    /**
     * Node Http Server - undefined until `http` boot cycle.
     * This is the server used by express.
     */
    http: Server | undefined;

    /**
     * Node Https Server - undefined until `https` boot cycle.
     * This is the server used by express.
     */
    https: HttpServer | undefined;

    private readonly useExpressRequestHandler: boolean;

    /**
     * Provide Custom Boot Cycles used by this provider.
     */
    customBootCycles() {
        return [
            // list of boot cycles available on this module
            "expressInit",
            "http",
            "https"
        ];
    }

    constructor($: Xpresser, config: Partial<ExpressProviderConfig> = {}) {
        super($);
        this.useExpressRequestHandler = config.requestHandler === "express";
    }

    /**
     * Initialize Express Provider
     * @param $
     */
    async init() {
        const $ = this.$;
        // import express
        const { default: express } = await import("express");

        // set isProduction
        this.isProduction = $.config.data.env === "production";

        // get paths
        const paths = $.config.data.paths;
        const isUnderMaintenance = File.exists($.path.base(".maintenance"));

        // get server configs
        const serverConfig = $.config.data.server;

        // initialize express
        this.app = express();

        /**
         * HttpToHttps Enforcer.
         * This has to be the first middleware because we need the redirect to run before every other request does.
         */
        if (serverConfig.forceHttpToHttps) {
            this.app.use((req, res, next) => {
                const isSecure = req.headers["x-forwarded-proto"] === "https" || req.secure;

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
        const poweredBy = serverConfig.poweredBy;
        const overrideServerName = serverConfig.name;

        if (!!poweredBy || !!overrideServerName) {
            const poweredByString: string = typeof poweredBy === "string" ? poweredBy : "Xpresser";

            this.app.use((_req, res, next) => {
                res.set("X-Powered-By", poweredByString);
                if (overrideServerName) res.set("Server", poweredByString);
                next();
            });
        } else {
            this.app.disable("x-powered-by");
        }

        /**
         * Serve Public folder as static
         */
        const servePublicFolder = serverConfig.servePublicFolder;
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
         * By default, Cors is disabled.
         * if you don't define a config @ {server.use.cors}
         */
        const useCors = serverConfig.use!.cors;
        if (useCors) {
            const { default: cors } = await import("cors");
            this.app.use(cors($.config.data.server.configs!.cors));
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
        const useBodyParser = serverConfig.use!.bodyParser;
        if (useBodyParser) {
            const { default: bodyParser } = await import("body-parser");
            const bodyParserJsonConfig = $.config.data.server.configs!.bodyParser?.json;
            const bodyParserUrlEncodedConfig = $.config.data.server.configs!.bodyParser
                ?.urlencoded || {
                extended: true
            };

            this.app.use(bodyParser.json(bodyParserJsonConfig));
            this.app.use(bodyParser.urlencoded(bodyParserUrlEncodedConfig));

            /**
             * Skip Bad Json Error
             */
            this.app.use((err: any, _req: any, _res: any, next: any) => {
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
        const template = serverConfig.template;
        if (template) {
            if (typeof template.engine === "function") {
                this.app.engine(template.extension, template.engine);
                this.app.set("view engine", template.extension);
            } else {
                if (typeof template.use === "string") {
                    const module = await importDefault<any>(() => import(template.use as string));
                    this.app.use(module);
                } else if (typeof template.use === "function") {
                    /**
                     * Todo: Fix this any
                     */
                    this.app.use(template.use as any);
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

        // process routes
        $.on.bootServer(
            BootCycleFunction("ProcessRoutes", async (next) => {
                this.processRoutes();
                next();
            })
        );
    }

    /**
     * Boot Method
     */
    async boot() {
        const $ = this.$;
        // import createServer as createHttpServer
        const { createServer: createHttpServer } = await import("http");

        // Create http server
        this.http = createHttpServer(this.app);

        // Run http event
        await $.runBootCycle("http");

        // get server port
        const port = $.config.data.server?.port || 80;

        // Start Server
        await new Promise((resolve, reject) => {
            this.http!.on("error", (err: any) => {
                if (err["errno"] === "EADDRINUSE") {
                    return $.console.logErrorAndExit(`Port ${err["port"]} is already in use.`);
                }

                return reject(err);
            });

            this.http!.listen(port, async () => {
                OnHttpListen($, port);

                const hasSslEnabled = $.config.get("server.ssl.enabled", false);
                if (hasSslEnabled) await this.startHttpsServer($);

                resolve(true);
            });
        });

        $.on.stopServer((next) => {
            this.http!.close((err) => {
                if (err) {
                    $.console.logError("Error closing server");
                    $.console.logError(err);
                } else {
                    $.console.logSuccess("Server closed successfully");
                }
                next();
            });
        });
    }

    async startHttpsServer($: Xpresser) {
        // import createServer as createHttpServer
        const { createServer: createHttpsServer } = await import("https");

        if (!$.config.has("server.ssl.files")) {
            $.console.logErrorAndExit("Ssl enabled but has no {server.ssl.files} config found.");
        }

        const files = $.config.get<{
            key: string;
            cert: string;
        }>("server.ssl.files");

        // noinspection SuspiciousTypeOfGuard
        if (typeof files.key !== "string" || typeof files.cert !== "string") {
            $.console.logErrorAndExit("Config {server.ssl.files} not configured properly!");
        }

        if (!files.key.length || !files.cert.length) {
            $.console.logErrorAndExit("Config {server.ssl.files} not configured properly!");
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

    /**
     * Process Routes
     * @private
     */
    private processRoutes() {
        const router = this.getRouter();
        const routerService = RouterService.use(router);
        const routes = routerService.toArray();

        for (const route of routes) {
            const method = route.method.toLowerCase() as keyof typeof this.app;

            if (!this.app[method]) {
                this.$.console.logError(`Method ${String(method)} is not supported by express`);
                continue;
            }

            this.handleRoute(route);
        }
    }

    /**
     * handleRoute - Handle Route
     * If `useNativeRequestHandler` is true, it calls the controller with `req` and `res`
     * else it calls the controller with an instance of `NodeHttpServerRequestEngine`
     * @param route
     * @private
     */
    private handleRoute(route: RouteData): void {
        if (this.useExpressRequestHandler) {
            this.handleNativeRoute(route);
        } else {
            this.handleXpresserRoute(route);
        }
    }

    /**
     * Calls the controller with `req` and `res`
     * @param route
     * @param req
     * @param res
     * @private
     */
    private handleNativeRoute(route: RouteData): void {
        const method = route.method.toLowerCase() as keyof typeof this.app;
        this.app[method](route.path, route.controller);
    }

    private handleXpresserRoute(route: RouteData): void {
        const method = route.method.toLowerCase() as keyof typeof this.app;
        this.app[method](route.path, (req: Request, res: Response) => {
            this.handleXpresserRequest(route, req, res);
        });
    }

    /**
     * Calls the controller with an instance of `NodeHttpServerRequestEngine`
     * @param route
     * @param req
     * @param res
     * @private
     */
    private handleXpresserRequest(route: RouteData, req: Request, res: Response): void {
        const http = ExpressRequestEngine.use(this.$, route, req, res);
        this.handleRequest(route, http as unknown as RequestEngine);
    }

    getNativeRouter<Router = XpresserRouter<ReqHandlerFunction>>(): Router {
        return super.getRouter() as Router;
    }

    /**
     * Use Express Provider
     * @param $
     * @param config
     * @example
     * const { router } = await Provider.use($);
     *
     * router.get("/", (http) => {
     *     http.json({ message: "Hello World!!" });
     * });
     */

    static async use(
        $: Xpresser,
        config: Partial<ExpressProviderConfig & { defaultModule: boolean }> = {}
    ) {
        const { defaultModule, ...others } = config;

        // Initialize Server
        const server = new this($, others);

        // Register Server Module
        await RegisterServerModule($, server, defaultModule === true);

        // Return raw router that makes use express request handler
        const nativeRouter = server.getNativeRouter();

        // Return router type that makes use of the xpresser request handler
        const router = server.getRouter<RouterReqHandlerFunction>();

        return { server, nativeRouter, router };
    }
}
