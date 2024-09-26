import { init, __dirname } from "@xpresser/framework";
import ExpressProvider from "../index.js";

// Get Base Folder Path
const base = __dirname(import.meta.url);

// Init Xpresser
const $ = await init({
    env: "development",
    name: "Express Provider",
    paths: { base }
});

// Register Server Module with Express Provider
const { router } = await ExpressProvider.use($);

router.get("/", (http) => {
    return http.send("Hello World!");
});

// Start Xpresser
$.start().catch($.console.logErrorAndExit);
