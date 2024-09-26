import { RequestEngine } from "@xpresser/server-module/engines/RequestEngine.js";
import type { Xpresser } from "@xpresser/framework";
import type { Request, Response } from "express";
import type { RouteData } from "@xpresser/server-module/router/RouterRoute.js";
import type XpresserRouter from "@xpresser/server-module/router/index.js";

/**
 * @class ExpressRequestEngine
 */
class ExpressRequestEngine extends RequestEngine {
    /** @property {IncomingMessage} req - The Node.js request object */
    public req!: Request;

    /** @property {ServerResponse} res - The Node.js response object */
    public res!: Response;

    /**
     * @description Creates and initializes a new ExpressRequestEngine instance for the given request/response pair.
     * @param $
     * @param {IncomingMessage} req - The Node.js request object
     * @param {ServerResponse} res - The Node.js response object
     * @param route
     */
    static use<T extends typeof ExpressRequestEngine>(
        this: T,
        $: Xpresser,
        route: RouteData,
        req: Request,
        res: Response
    ) {
        const rq = new this(route, {
            xpresser: () => $,
            state: {},
            respond: (data) => res.send(data),
            setStatusCode: (code) => res.status(code),
            redirect: (url) => res.redirect(url),
            setHeader: (type, key, value) => {
                if (type === "response") {
                    res.setHeader(key as string, value as string);
                } else {
                    req.headers[key as string] = value as string;
                }
            },
            getHeader: (type, key) =>
                (type === "response"
                    ? res.getHeader(key as string)
                    : req.headers[key as string]) as string,

            parseParams: () => req.params,
            parseQuery: () => req.query as Record<string, any>,
            parseBody: () => req.body,
            next: () => (req.next ? req.next() : null),
            respondJson: (data) => res.json(data)
        });

        rq.req = req;
        rq.res = res;

        return rq as InstanceType<T>;
    }
}

export default ExpressRequestEngine;

/**
 * Handler Function Type
 */

export type ReqHandlerFunction = (http: ExpressRequestEngine) => void;
export type RouterReqHandlerFunction = XpresserRouter<ReqHandlerFunction>;
