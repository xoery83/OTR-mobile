// Owner-authorized acceptance only: approved public CA on stdin, active container credential only.
const { Buffer } = require("node:buffer");
const fs = require("node:fs"),
  dns = require("node:dns").promises,
  net = require("node:net"),
  tls = require("node:tls");
const ca = fs.readFileSync(0, "utf8"),
  host = "db.tuqigdxrvrerfewsxqgm.supabase.co";
async function handshake(identity, trust) {
  return await new Promise((resolve, reject) => {
    let raw, secure;
    const finish = (value, error) => {
      clearTimeout(timer);
      secure?.destroy();
      raw?.destroy();
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(null, new Error("TLS_TIMEOUT")), 6000);
    raw = net.createConnection({ host, port: 5432, family: 6 });
    raw.on("error", (e) => finish(null, e));
    raw.once("connect", () => {
      const q = Buffer.alloc(8);
      q.writeUInt32BE(8, 0);
      q.writeUInt32BE(80877103, 4);
      raw.write(q);
    });
    raw.once("data", (b) => {
      if (b.length !== 1 || b[0] !== 83) return finish(null, new Error("SSLREQUEST"));
      secure = tls.connect({
        socket: raw,
        servername: identity,
        ca: trust ? ca : [],
        rejectUnauthorized: true,
        minVersion: "TLSv1.3",
        maxVersion: "TLSv1.3",
      });
      secure.once("error", (e) => finish({ rejected: e.code }));
      secure.once("secureConnect", () =>
        finish({
          verified: secure.authorized,
          protocol: secure.getProtocol(),
          peer: secure.remoteAddress,
          family: secure.remoteFamily,
        }),
      );
    });
  });
}
(async () => {
  try {
    const k = process.env.OTR_DEV_SUPABASE_SECRET_KEY;
    if (
      !k ||
      !k.startsWith("sb_secret_") ||
      process.env.OTR_DEV_SUPABASE_URL !== "https://tuqigdxrvrerfewsxqgm.supabase.co"
    )
      throw 0;
    const r = await fetch(
      process.env.OTR_DEV_SUPABASE_URL + "/auth/v1/admin/users?page=1&per_page=1",
      { headers: { apikey: k }, signal: AbortSignal.timeout(10000) },
    );
    if (r.body) await r.body.cancel();
    if (r.status !== 200) throw 0;
    const aaaa = await dns.resolve6(host);
    if (!aaaa.length) throw 0;
    const positive = await handshake(host, true),
      wrong = await handshake("wrong.invalid", true),
      untrusted = await handshake(host, false);
    if (
      !positive.verified ||
      positive.protocol !== "TLSv1.3" ||
      positive.family !== "IPv6" ||
      wrong.rejected !== "ERR_TLS_CERT_ALTNAME_INVALID" ||
      !untrusted.rejected
    )
      throw 0;
    const unix = await new Promise((resolve) => {
      const s = net.connect("/run/caddy-admin/admin.sock");
      s.on("connect", () => {
        s.destroy();
        resolve("UNEXPECTED");
      });
      s.on("error", (e) => resolve(e.code));
    });
    if (unix !== "ENOENT" && unix !== "EACCES") throw 0;
    for (const address of ["127.0.0.1", "127.0.0.2", "::1"]) {
      const e = await new Promise((resolve) => {
        const s = net.connect({ host: address, port: 2019 });
        s.setTimeout(1500, () => {
          s.destroy();
          resolve("TIMEOUT");
        });
        s.on("connect", () => {
          s.destroy();
          resolve("UNEXPECTED");
        });
        s.on("error", (e) => resolve(e.code));
      });
      if (e !== "ECONNREFUSED") throw 0;
    }
    console.log(
      JSON.stringify({
        privileged_read: 200,
        direct_aaaa: aaaa,
        direct_tls: positive,
        wrong_hostname: "REJECTED",
        untrusted_chain: "REJECTED",
        admin_unix: unix,
        admin_tcp: "DENIED",
      }),
    );
  } catch {
    console.log("FAILED: private Backend acceptance");
    process.exitCode = 1;
  }
})();
