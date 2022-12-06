import {init, __dirname} from "@xpresser/framework/index.js";
import {RegisterServerModule} from "@xpresser/server-module";
import ExpressProvider from "./index.js";

// Get Base Folder Path
const base = __dirname(import.meta.url);

// Init Xpresser
const $ = await init({
    env: "name",
    debug: {
        bootCycle: {
            started: true,
            completed: true,
        }
    },
    paths: {
        base,
    },
});

//  Initialize Express Server Module Provider
const express = new ExpressProvider();

// Register Server Module with Express Provider
await RegisterServerModule($, express);

$.start().catch((e) => $.console.logErrorAndExit(e));

