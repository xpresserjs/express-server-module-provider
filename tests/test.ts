import { init, __dirname } from "@xpresser/framework";
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
const expressProvider = await InitializeExpress($);

// Add Routes Function
function AddRoutes() {
    const { app } = expressProvider;

    app.get("/", (req, res) => {
        return res.send("Hello World!");
    });
}

// Add routes to express on expressInit
$.on.expressInit$(AddRoutes);

// Start Xpresser
$.start().catch($.console.logErrorAndExit);
