FROM node:22-bookworm-slim

WORKDIR /srv
COPY package.json .
RUN npm install --omit=dev --no-audit --no-fund
COPY server.mjs .

# sherpa-onnx loads its shared libraries from the platform package; both paths so the image builds on x64 and Apple silicon.
ENV LD_LIBRARY_PATH=/srv/node_modules/sherpa-onnx-linux-x64:/srv/node_modules/sherpa-onnx-linux-arm64
ENV MODELS_DIR=/models
EXPOSE 8765
CMD ["node", "server.mjs"]
