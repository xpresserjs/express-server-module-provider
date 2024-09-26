import "@xpresser/framework/engines/BootCycleEngine.js";
import "@xpresser/server-module";
import { ApplicationRequestHandler } from "express-serve-static-core";

/**
 * Add BootCycle types
 */
declare module "@xpresser/framework/engines/BootCycleEngine.js" {
    module BootCycle {
        enum Cycles {
            expressInit = "expressInit",
            http = "http",
            https = "https"
        }
    }
}

/**
 * Express server template engine function type.
 */
type ExpressTemplateEngine = (
    path: string,
    options: object,
    callback: (e: any, rendered?: string) => void
) => void;

declare module "@xpresser/server-module/types/index.js" {
    module ServerConfig {
        interface Main {
            template?: {
                engine: string | ExpressTemplateEngine;
                use: string | ApplicationRequestHandler<any>;
                extension: string;
            };
        }

        interface Configs {
            bodyParser?: { json: any; urlencoded: any };
        }
    }
}
