import { init, __dirname } from "@xpresser/framework";
import ExpressProvider from "../index.js";

// Get Base Folder Path
const base = __dirname(import.meta.url);

// Init Xpresser
const $ = await init({
    env: "development",
    name: "Express Provider",
    debug: {
        enabled: false,
        bootCycle: { started: true, completed: true },
        bootCycleFunction: { started: true, completed: true }
    },
    paths: { base }
});

// Register Server Module with Express Provider
const { router } = await ExpressProvider.use($);

// Add Routes Function
function AddRoutes() {
    router.get("/", (http) => {
        return http.send("Hello World!");
    });
}

// Add routes to express on expressInit
$.onNext("expressInit", AddRoutes);

// Start Xpresser
$.start().catch($.console.logErrorAndExit);
