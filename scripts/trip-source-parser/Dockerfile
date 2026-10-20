FROM node@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
WORKDIR /worker
COPY vendor/pngjs-7.0.0.tgz vendor/pngjs-7.0.0.tgz
RUN echo 'c4b71873d48a692dd5eeb1dcb62185c7aafe40f2180c7cc7f30ec71e89a080be  vendor/pngjs-7.0.0.tgz' | sha256sum -c - && mkdir decoder && tar -xzf vendor/pngjs-7.0.0.tgz --strip-components=1 -C decoder && rm -f decoder/browser.js && chmod -R a+rX decoder
COPY profile.mjs protocol.mjs png-decode.mjs png-worker.mjs Dockerfile ./
USER 65534:65534
ENTRYPOINT ["node", "--max-old-space-size=64", "/worker/png-worker.mjs"]
