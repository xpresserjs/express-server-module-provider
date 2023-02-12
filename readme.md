# XpresserJs Express Server Module provider

This module provides an express server for XpresserJs.

```typescript
import {init, __dirname} from "@xpresser/framework";
import { InitializeExpress } from "@xpresser/express-module";

// Get Base Folder Path
const base = __dirname(import.meta.url);

// Init Xpresser
const $ = await init({
    env: "development",
    paths: {base},
});

// Register Server Module with Express Provider
const expressProvider = await InitializeExpress($);

// log on started
$.on.expressInit((next) => {
    expressProvider.app // express app
    expressProvider.http // http server
    expressProvider.https // http server (if ssl is enabled) socket.io server
})

// Start Xpresser
$.start().catch($.console.logErrorAndExit);
```