const net = require("node:net");
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const opts = args[0];
  if (
    (typeof opts === "string" && opts.startsWith("/")) ||
    (opts && typeof opts === "object" && opts.path)
  )
    return original.apply(this, args);
  throw new Error("LIVE_W_EXTERNAL_NETWORK_DENIED");
};
globalThis.fetch = async () => {
  throw new Error("LIVE_W_EXTERNAL_FETCH_DENIED");
};
