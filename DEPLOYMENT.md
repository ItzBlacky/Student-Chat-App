# StudyMate Split Deployment

The project is split into two deployment roots:

- `frontend/` is the static browser app for Vercel and the GoDaddy domain.
- `backend/` is the Node.js, Express, Socket.IO, and MySQL API service for a backend host such as Render, Railway, or a VPS.

## Backend Environment

Deploy from the `backend/` folder.

Required environment variables:

```env
PORT=5000
JWT_SECRET=replace-with-a-long-random-secret
DB_HOST=your-mysql-host
DB_USER=your-mysql-user
DB_PASS=your-mysql-password
DB_NAME=your-mysql-database
FRONTEND_URL=https://your-godaddy-domain.com
```

Use `FRONTEND_URLS` instead of `FRONTEND_URL` if you need multiple allowed origins:

```env
FRONTEND_URLS=https://your-godaddy-domain.com,https://your-vercel-project.vercel.app
```

Backend commands:

```bash
npm install
npm start
```

## Frontend Environment

Deploy from the `frontend/` folder.

Set these Vercel environment variables:

```env
FRONTEND_API_BASE_URL=https://your-backend-service.example.com
FRONTEND_SOCKET_URL=https://your-backend-service.example.com
```

The frontend build writes those values into `frontend/js/config.js`. Locally, if no frontend config is set and the page is opened on `localhost`, the app falls back to `http://localhost:5000`.

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

Then open `http://localhost:5173`.

## GoDaddy and Vercel

GoDaddy only points the domain to Vercel. In Vercel, set the project root directory to `frontend/`, then follow Vercel's domain instructions for the exact GoDaddy DNS records.

## File Upload Note

The backend currently stores uploaded files on the backend server filesystem under `backend/server/uploads`. This is fine for local development and some persistent servers, but many cloud hosts use temporary filesystems. For production, move uploads to persistent object storage such as S3, Cloudinary, or a database-backed file service.
