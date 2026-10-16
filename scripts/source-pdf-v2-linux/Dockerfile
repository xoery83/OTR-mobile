FROM node@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
RUN apt-get update -qq \
    && apt-get install -y --no-install-recommends qpdf=11.3.0-1+deb12u1 poppler-utils=22.12.0-2+deb12u3 \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /worker
COPY profile.mjs extract.mjs worker.mjs ./
USER 65534:65534
ENTRYPOINT ["node", "--max-old-space-size=128", "/worker/worker.mjs"]
