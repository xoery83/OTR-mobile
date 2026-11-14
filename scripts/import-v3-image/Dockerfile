FROM node@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
WORKDIR /worker
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY decode.mjs ./
USER 65534:65534
ENTRYPOINT ["node", "--max-old-space-size=64", "/worker/decode.mjs"]
