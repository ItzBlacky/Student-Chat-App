# StudyMate Split Deployment

The project is split into two deployment roots:

- `frontend/` is the static browser app for Vercel and the GoDaddy domain.
- `backend/` is the Node.js, Express, Socket.IO, and MongoDB API service for a backend host such as Render, Railway, or a VPS.

## Backend Environment

Deploy from the `backend/` folder.

Required environment variables:

```env
PORT=5000
JWT_SECRET=replace-with-a-long-random-secret
MONGO_URI=mongodb+srv://user:password@cluster.example.mongodb.net/?appName=YourApp
MONGO_DB_NAME=studymate
FRONTEND_URL=https://your-godaddy-domain.com
```

`MONGO_DB_NAME` is required when the database name is not included in the `MONGO_URI` path.

Rotate any database password that has been shared in chat, screenshots, commits, or deployment logs. After rotating, update `MONGO_URI` in local `.env` and in the backend host's environment variables.

In MongoDB Atlas, open **Network Access** and allow the backend host's outbound IP address. For temporary testing only, you can allow `0.0.0.0/0`; tighten this before production use.

Use `FRONTEND_URLS` instead of `FRONTEND_URL` if you need multiple allowed origins:

```env
FRONTEND_URLS=https://your-godaddy-domain.com,https://your-vercel-project.vercel.app
```

Backend commands:

```bash
npm install
npm start
```

Health checks:

```text
GET /
GET /health
```

Both endpoints ping MongoDB. A healthy backend returns `status: "ok"` and `database: "connected"`. If MongoDB is unreachable, the endpoint returns HTTP `503`.

## Frontend Environment

Deploy from the `frontend/` folder.

Set these Vercel environment variables:

```env
REACT_APP_API_URL=https://your-backend-service.example.com
REACT_APP_SOCKET_URL=https://your-backend-service.example.com
```

The frontend build writes those values into `frontend/js/config.js`. Locally, if no frontend config is set and the page is opened on `localhost`, the app falls back to `https://student-chat-application.onrender.com`.

Frontend commands:

```bash
npm run build
npm run dev
```

## Local Development

Start the backend:

```bash
cd backend
npm install
npm start
```

Start the frontend in another terminal:

```bash
cd frontend
npm run dev
```

Then open `https://student-chat-application.onrender.com`.

## GoDaddy and Vercel

GoDaddy only points the domain to Vercel. In Vercel, set the project root directory to `frontend/`, then follow Vercel's domain instructions for the exact GoDaddy DNS records.

## File Upload Note

The backend currently stores uploaded files on the backend server filesystem under `backend/server/uploads`. This is fine for local development and some persistent servers, but many cloud hosts use temporary filesystems. For production, move uploads to persistent object storage such as S3, Cloudinary, or a database-backed file service.
