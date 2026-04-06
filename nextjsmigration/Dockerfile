FROM node:18-alpine as builder
RUN apk add --no-cache zip
WORKDIR /kit
COPY . .
RUN cd apworld && zip -r ../nextjsmigration/public/bikeapelago.apworld bikeapelago/ || true
RUN cd nextjsmigration && npm install
RUN cd nextjsmigration && npm run build

FROM node:18-alpine as runner
WORKDIR /app
COPY --from=builder /kit/nextjsmigration/out /app/out
COPY --from=builder /kit/db /app/db
RUN npm install -g serve

EXPOSE 8080 8090
CMD ["sh", "-c", "serve -s /app/out -l 8080 & /app/db/pocketbase serve --http=0.0.0.0:8090"]