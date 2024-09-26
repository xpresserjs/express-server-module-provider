# XpresserJs Express Server Module provider

This module provides an express server for XpresserJs.

If you are conversant with the common js version of XpresserJs, 
this module is the equivalent of that with a few yet to arrive features.

```typescript
import { init, __dirname } from "@xpresser/framework";
import ExpressProvider from "@xpresser/express-module";

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

```