# Shared wardrobe data lives outside avenlab-server; build from repository root.
FROM rust:1-bookworm AS builder
WORKDIR /build/avenlab-server
COPY avenlab-server/ ./
COPY packages/wardrobe-catalog/ /build/packages/wardrobe-catalog/
RUN cargo build --release --locked --jobs 1

FROM debian:bookworm-slim
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /data \
    && chown 10001:10001 /data
COPY --from=builder /build/avenlab-server/target/release/avenlab-server /usr/local/bin/avenlab-server
COPY --from=builder /build/avenlab-server/src/assets /build/avenlab-server/src/assets
WORKDIR /build/avenlab-server
USER 10001:10001
EXPOSE 9001
ENTRYPOINT ["/usr/local/bin/avenlab-server"]
