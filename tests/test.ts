import { init, __dirname } from "@xpresser/framework/index.js";
import { InitializeExpress } from "../index.js";

// Get Base Folder Path
const base = __dirname(import.meta.url);

// Init Xpresser
const $ = await init({
    env: "development",
    name: "Express Provider",
    debug: {
        bootCycle: {
            started: true,
            completed: true
        },
        bootCycleFunction: {
            started: true,
            completed: true
        }
    },
    paths: { base }
});

// Register Server Module with Express Provider
await InitializeExpress($);

// Start Xpresser
$.start().catch($.console.logError);
