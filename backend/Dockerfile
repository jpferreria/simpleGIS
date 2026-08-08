FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Ensure data directory exists
RUN mkdir -p /usr/src/app/data

EXPOSE 3001

CMD ["npm", "start"]
