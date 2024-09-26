import type { Xpresser } from "@xpresser/framework/xpresser.js";
import "../index.js";
import { test } from "@japa/runner";
import ExpressProvider from "../index.js";
import { SetupXpresser, TearDownXpresser } from "./src/functions.js";
import { RouterReqHandlerFunction } from "../src/ExpressRequestEngine.js";

const API_TIMEOUT = 5000;
test.group("Express Server Provider", (group) => {
    let $: Xpresser;
    let server: ExpressProvider;

    group.setup(async () => {
        $ = await SetupXpresser();

        const http = await ExpressProvider.use($, {
            requestHandler: "express",
            defaultModule: true
        });

        server = http.server;
    });

    group.teardown(() => TearDownXpresser($));

    test("Add Routes", async () => {
        const router = server.getNativeRouter();

        router.get("/", (_req, res) => {
            res.send("Hello World!");
        });

        router.get("/about", (_req, res) => {
            res.send("About Page");
        });
    });

    test("Start Xpresser", async () => {
        // Start Xpresser
        $.onNext("serverBooted", function LogRouteInfo() {
            const routesLength = server.getRouter().routes.length;
            $.console.logInfo(`Using ${routesLength} routes.`);
        });

        await $.start();
    });

    test("GET /", async ({ client, assert }) => {
        const response = await client.get("/").timeout(API_TIMEOUT);
        response.assertStatus(200);
        assert.equal(response.text(), "Hello World!");
    });

    test("GET /about", async ({ client, assert }) => {
        const response = await client.get("/about").timeout(API_TIMEOUT);
        response.assertStatus(200);
        assert.equal(response.text(), "About Page");
    });
});

test.group("Node Server Module With Xpresser Engine", (group) => {
    let $: Xpresser;
    let server: ExpressProvider;
    let router: RouterReqHandlerFunction;

    group.setup(async () => {
        $ = await SetupXpresser();
        const http = await ExpressProvider.use($, {
            defaultModule: true
        });

        server = http.server;
        router = http.router;
    });

    group.teardown(() => TearDownXpresser($));

    test("Add Routes", async () => {
        router.get("/", (http) => {
            http.send("Hello World!");
        });

        router.get("/about", (http) => {
            http.send("About Page");
        });
    });

    test("Start Xpresser", async () => {
        // Start Xpresser
        $.onNext("serverBooted", function LogRouteInfo() {
            const routesLength = server.getRouter().routes.length;
            $.console.logInfo(`Using ${routesLength} routes.`);
        });

        await $.start();
    });

    test("GET /", async ({ client, assert }) => {
        const response = await client.get("/").timeout(API_TIMEOUT);
        response.assertStatus(200);
        assert.equal(response.text(), "Hello World!");
    });

    test("GET /about", async ({ client, assert }) => {
        const response = await client.get("/about").timeout(API_TIMEOUT);
        response.assertStatus(200);
        assert.equal(response.text(), "About Page");
    });
});
