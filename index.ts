import moment from "moment";
import { resolve } from "node:path";
import type { Server } from "node:http";
import type { Server as HttpServer } from "node:https";
import type { Express } from "express";
import {
    HttpServerProvider,
    type HttpServerProviderStructure
} from "@xpresser/server-module/provider.js";
import File from "@xpresser/framework/classes/File.js";
import { importDefault } from "@xpresser/framework/functions/module.js";
import { RegisterServerModule } from "@xpresser/server-module/index.js";
import type { Xpresser } from "@xpresser/framework/xpresser.js";

/**
 * Express Provider
 * This provider is used to create an express server.
 */
export class ExpressProvider extends HttpServerProvider implements HttpServerProviderStructure {
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

    /**
     * Is Production - true if env is production.
     * This is used to deploy express in production mode.
     * @private
     */
    private isProduction: boolean = false;

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

    /**
     * Initialize Express Provider
     * @param $
     */
    async init($: Xpresser) {
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
         * By default, Cors is disabled,
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
                    return $.console.logErrorAndExit(`Port ${err["port"]} is already in use.`);
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
                    $.console.log(`Domain: ${domain} | Port: ${port} | BaseUrl: ${baseUrl}`);
                } else {
                    $.console.log(`Url: ${baseUrl}`);
                }

                /**
                 * Show Lan Ip in development mood
                 */
                if (!this.isProduction && lanIp) $.console.log(`Network: http://${lanIp}:${port}/`);

                /**
                 * Show Server Started Time only on production
                 */
                if (this.isProduction)
                    $.console.log(`Server started - ${ServerStarted.toString()}`);

                // Save values to engineData
                $.engineData.set({
                    ServerStarted,
                    getServerUptime
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
}

/**
 * Register Xpresser Server Module
 * This is a shorthand for registering this module.
 * @param $
 * @constructor
 */
export async function InitializeExpress($: Xpresser) {
    const expressApp = new ExpressProvider();
    await RegisterServerModule($, expressApp);
    return expressApp;
}
