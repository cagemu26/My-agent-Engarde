FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --prefer-offline || npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
