ARG BACKEND_BASE
ARG COMPILER_BASE=node@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
ARG IMAGE_DECODER=sha256:c31fb8c4b80642e85d970b14bf9a2ff7410adff615690b716546f9ccea93da32
ARG PDF_DECODER=sha256:d27ddd7b09410b0a3b220b2768c0f6b2b25c32da528a42041bc50ea19eefc1b7
FROM ${COMPILER_BASE} AS compiler
RUN apt-get update -qq && apt-get install -y --no-install-recommends gcc libc6-dev linux-libc-dev
COPY sandbox.c /tmp/sandbox.c
RUN cc -std=c11 -O2 -Wall -Wextra -Werror /tmp/sandbox.c -o /sandbox

FROM ${IMAGE_DECODER} AS image
FROM ${PDF_DECODER} AS pdf
USER root
RUN mkdir -p /pack/bin /pack/lib \
    && cp /usr/bin/qpdf /usr/bin/pdftotext /pack/bin/ \
    && ldd /usr/bin/qpdf /usr/bin/pdftotext | awk '/=> \/.*\.so/ && $3 !~ /\/lib(c|m|pthread|dl|rt)\.so/ {print $3}' | sort -u | xargs cp -L -t /pack/lib/

FROM ${BACKEND_BASE}
COPY --from=compiler /sandbox /opt/otr/import-v3/sandbox
COPY --from=image /worker/node_modules /opt/otr/import-v3/node_modules
COPY --from=image /worker/decode.mjs /opt/otr/import-v3/decode.mjs
COPY --from=pdf /pack /opt/otr/import-v3/pdf
COPY decode-pdf.mjs probe.mjs extract.mjs profile.mjs /opt/otr/import-v3/
COPY --chown=otr:otr server-capture.mjs /app/server-capture.mjs
CMD ["node", "server-capture.mjs"]
