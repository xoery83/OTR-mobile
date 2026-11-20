import { createServer, request as httpRequest } from "node:http";
import { expect, it } from "vitest";
import { loopbackServer, proxyRequestHeaders } from "./http";
it("forwards a chunked request without invalid framing or connection-private headers, retaining the intended bearer", async () => {
  const target = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += String(chunk);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        body,
        authorization: req.headers.authorization,
        privateHeader: req.headers["x-hop"],
      }),
    );
  });
  await new Promise<void>((resolve) => target.listen(0, "127.0.0.1", resolve));
  const t = target.address();
  if (!t || typeof t === "string") throw Error("PORT_REQUIRED");
  const proxy = loopbackServer(async (req) =>
    fetch(`http://127.0.0.1:${t.port}/logout`, {
      method: "POST",
      headers: proxyRequestHeaders(req.headers),
      body: await req.arrayBuffer(),
    }),
  );
  await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const p = proxy.address();
  if (!p || typeof p === "string") throw Error("PORT_REQUIRED");
  try {
    const result = await new Promise<any>((resolve, reject) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port: p.port,
          path: "/logout",
          method: "POST",
          headers: {
            "Transfer-Encoding": "chunked",
            Connection: "X-Hop",
            "X-Hop": "connection-private",
            Authorization: "Bearer synthetic-fixture",
          },
        },
        (res) => {
          let body = "";
          res.on("data", (chunk) => (body += String(chunk)));
          res.on("end", () => {
            try {
              expect(res.statusCode).toBe(200);
              resolve(JSON.parse(body));
            } catch (error) {
              reject(error);
            }
          });
        },
      );
      req.on("error", reject);
      req.end("actual-sdk-body");
    });
    expect(result).toEqual({
      body: "actual-sdk-body",
      authorization: "Bearer synthetic-fixture",
    });
  } finally {
    await Promise.all([
      new Promise<void>((r) => proxy.close(() => r())),
      new Promise<void>((r) => target.close(() => r())),
    ]);
  }
});
