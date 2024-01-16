FROM node:18.16.1-slim

# set working directory
WORKDIR /app

# copy package.json and package-lock.json fgr server and frontend
COPY package*.json ./
COPY frontend-vite/package*.json ./frontend-vite/

# install dependencies
RUN npm run deps

# copy the rest of the application
COPY . .

# build the application
RUN npm run buildall

# expose the port the app runs on
EXPOSE 3000

# use the non-root 'node' user
USER node

# run the application
CMD ["npm", "start"]
