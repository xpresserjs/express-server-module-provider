import type {Express} from "express";
import {XpresserHttpServerProvider, HttpServerProvider} from "@xpresser/server-module/provider.js";
import type {Xpresser} from "@xpresser/framework/xpresser.js";
import File from "@xpresser/framework/classes/File.js";
import {importDefault} from "@xpresser/framework/functions/module.js";


class ExpressProvider extends HttpServerProvider implements XpresserHttpServerProvider {
    app!: Express;


    async init($: Xpresser) {

        // import express
        const {default: express} = await import('express');

        const isProduction = $.config.data.env === 'production';
        const paths = $.config.data.paths;
        const isUnderMaintenance = File.exists($.path.base('.maintenance'))


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
            const servePublicFolderOption = $.config.get("server.servePublicFolderOption", undefined);
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
            const {default: cors} = await import("cors");
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
            const {default: bodyParser} = await import("body-parser");
            const bodyParserJsonConfig = $.config.get("packages.body-parser.json");
            const bodyParserUrlEncodedConfig = $.config.get("packages.body-parser.urlencoded", {extended: true});

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
        const template = $.config.get('template');
        if(template) {
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
        const convertBodyEmptyStringToNull = $.config.get('server.convertBodyEmptyStringToNull', true);
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

    }
}

export default ExpressProvider;