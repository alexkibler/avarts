FROM node:18-alpine as builder
RUN apk add --no-cache zip
WORKDIR /kit
COPY . .
RUN cd apworld && zip -r ../static/bikeapelago.apworld bikeapelago/
RUN npm install
RUN npm run build && npm prune --production

FROM node:18-alpine as express
WORKDIR /app
COPY --from=builder /kit/build /app/build
COPY --from=builder /kit/db /app/db
COPY --from=builder /kit/server.js /app/server.js
COPY --from=builder /kit/package.json /app/package.json
COPY --from=builder /kit/package-lock.json /app/package-lock.json
RUN npm install express

ENV BODY_SIZE_LIMIT=5242880
EXPOSE 8080 8090
CMD ["sh", "-c", "node server.js & /app/db/pocketbase serve --http=0.0.0.0:8090"]
