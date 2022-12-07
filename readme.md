# XpresserJs Express Server Module provider

This module provides an express server for XpresserJs.

```typescript
import {init, __dirname} from "@xpresser/framework/index.js";
import {RegisterServerModule} from "@xpresser/server-module";
import ExpressProvider from "@xpresser/express-server-module-provider";

// Get Base Folder Path
const base = __dirname(import.meta.url);

// Init Xpresser
const $ = await init({
    env: "development",
    paths: {base},
});

//  Initialize Express Server Module Provider
const expressProvider = new ExpressProvider();

// Register Server Module with Express Provider
await RegisterServerModule($, expressProvider);


// log on started
$.on.expressInit((next) => {
    expressProvider.app // express app
    expressProvider.http // http server
    expressProvider.https // http server (if ssl is enabled) socket.io server
})

// Start Xpresser
$.start().catch($.console.logErrorAndExit);


```