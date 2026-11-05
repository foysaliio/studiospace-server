<div align="center">

# StudioSpace API

### The reservation and listing service behind StudioSpace

Every studio card starts with a host’s listing. Every reservation connects a member, a room and a time slot. This Express API keeps those records in MongoDB and controls who can read or change them.

[**API Status**](https://studiospace-server-house.vercel.app) · [**Featured Studios JSON**](https://studiospace-server-house.vercel.app/api/studios/featured) · [**Live Website**](https://studiospace-client-web.vercel.app) · [**Client Repository**](https://github.com/foysaliio/studiospace-client)

![Node.js](https://img.shields.io/badge/Node.js-244B30?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express_5-222222?style=for-the-badge&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB_Atlas-116149?style=for-the-badge&logo=mongodb&logoColor=white)
![Better Auth](https://img.shields.io/badge/Better_Auth-242424?style=for-the-badge)
![Vercel](https://img.shields.io/badge/Vercel-171717?style=for-the-badge&logo=vercel&logoColor=white)

</div>

---

## Try the API in one request

The public catalogue can be explored directly from a browser or terminal. This request returns studios in the **Podcast Lounge** category:

```bash
curl "https://studiospace-server-house.vercel.app/api/studios?category=Podcast%20Lounge"
```

Studio IDs in the response can be used to retrieve a listing and its reviews:

```text
GET /api/studios/<studio-id>
GET /api/studios/<studio-id>/reviews
```

For a quick deployment check, open the [API root](https://studiospace-server-house.vercel.app). Its response is:

```json
{ "message": "StudioSpace API is running" }
```

## How a reservation moves through the system

1. **Discover.** The public catalogue supplies studio cards. A detail request returns the studio’s rate, deposit, capacity, amenities and host information.
2. **Request.** A signed-in member chooses a start time and duration. The API checks for overlap with a confirmed session before creating a pending reservation.
3. **Track.** The member’s booking endpoint returns their reservations for the dashboard and **My bookings** page.
4. **Cancel.** A member can cancel their own pending reservation. The API records the cancelled status so the reservation can still appear in their history.

A saved studio follows a separate path. Saving a room adds it to the member’s shortlist and leaves its booking schedule available.

## Data responsibilities

| Area             | What the server manages                                                           |
| ---------------- | --------------------------------------------------------------------------------- |
| Studio catalogue | Public listings, category filtering, featured cards and individual studio details |
| Host listings    | Creation, ownership, updates, duplicate checks and deletion                       |
| Reservations     | Session timing, booking status, member history and pending cancellation           |
| Reviews          | Studio-specific comments, reviewer names and ratings from 1 to 5                  |
| Saved studios    | A personal shortlist that members can add to or remove from                       |
| Accounts         | Email/password access, Google sign-in, persistent sessions and password recovery  |

## API reference

### Studio catalogue and host listings

| Method   | Endpoint                | Access | Purpose                                            |
| -------- | ----------------------- | ------ | -------------------------------------------------- |
| `GET`    | `/api/studios`          | Public | Browse listings, optionally filtered by `category` |
| `GET`    | `/api/studios/featured` | Public | Load featured studio cards                         |
| `GET`    | `/api/studios/:id`      | Public | Read an individual studio                          |
| `GET`    | `/api/studios/mine`     | Member | Read the signed-in host’s listings                 |
| `POST`   | `/api/studios`          | Member | Publish a studio                                   |
| `PUT`    | `/api/studios/:id`      | Owner  | Update an owned listing                            |
| `DELETE` | `/api/studios/:id`      | Owner  | Remove an owned listing                            |

### Reservations, reviews and saved studios

| Method   | Endpoint                   | Access        | Purpose                           |
| -------- | -------------------------- | ------------- | --------------------------------- |
| `POST`   | `/api/bookings`            | Member        | Request a studio session          |
| `GET`    | `/api/bookings/mine`       | Member        | Retrieve personal booking history |
| `PATCH`  | `/api/bookings/:id/cancel` | Booking owner | Cancel a pending reservation      |
| `GET`    | `/api/studios/:id/reviews` | Public        | Read reviews for one studio       |
| `POST`   | `/api/studios/:id/reviews` | Member        | Submit a rating and comment       |
| `GET`    | `/api/saved-studios`       | Member        | Retrieve the personal shortlist   |
| `PUT`    | `/api/saved-studios/:id`   | Member        | Save a studio                     |
| `DELETE` | `/api/saved-studios/:id`   | Member        | Remove a saved studio             |

Better Auth handles account routes under `/api/auth`. The client uses `POST /api/mutation-token` to obtain a short-lived cookie before protected writes.

## What the server checks

**When a host publishes a listing**, the server validates the required text fields, category, HTTPS cover image URL, rates, deposit, capacity and amenities. The hourly rate must be positive, the deposit can be zero and capacity must be a positive whole number. The server takes the owner identity from the signed-in session.

**When a host edits or deletes a studio**, the operation is scoped to the studio ID and owner. Duplicate listing checks use the owner, title and location, allowing different hosts to publish their own spaces.

**When a member changes data**, the mutation middleware checks the request origin and verifies a five-minute HTTP-only JWT. It then matches the token’s user and session IDs against the active Better Auth session before handing the request to the route.

**When a member requests a password reset**, Better Auth creates a time-limited link and Nodemailer sends it through Gmail. The reset link is valid for 30 minutes.

## Project structure

```text
src/
├── server.js          Express routes, database access and request validation
├── auth.js            Better Auth, Google sign-in and password-reset email
└── mutation-auth.js   Origin checks and session-bound mutation cookies
```

The [Next.js client](https://github.com/foysaliio/studiospace-client) owns the interface, invoice downloads and ImgBB upload handler. The Express server stores and serves the resulting studio image URL.

## Run the server locally

```bash
git clone https://github.com/foysaliio/studiospace-server.git
cd studiospace-server
npm ci
```

Create `.env` beside `package.json` and supply your own values:

```dotenv
MONGODB_URI=your_mongodb_connection_string
MONGODB_DB_NAME=studiospace

BETTER_AUTH_SECRET=your_generated_auth_secret
BETTER_AUTH_URL=http://localhost:5000
CLIENT_URL=http://localhost:3000
MUTATION_JWT_SECRET=your_generated_mutation_secret

GOOGLE_CLIENT_ID=your_google_oauth_client_id
GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret

GMAIL_USER=your_gmail_address
GMAIL_APP_PASSWORD=your_gmail_app_password
```

Use two independently generated secrets for `BETTER_AUTH_SECRET` and `MUTATION_JWT_SECRET`. For Google sign-in during local development, add the following entry to the OAuth client’s **Authorized redirect URIs**:

```text
http://localhost:5000/api/auth/callback/google
```

Start the development server:

```bash
npm run dev
```

Open [localhost:5000](http://localhost:5000) for the status response or [the local catalogue](http://localhost:5000/api/studios) for a database-backed request. Start the client on port `3000` to try a complete booking.

| Command       | Purpose                                        |
| ------------- | ---------------------------------------------- |
| `npm run dev` | Run the server with Nodemon during development |
| `npm start`   | Run the Express entry point with Node.js       |

## Production configuration

The Express deployment serves the API. The frontend domain is the public entry point for browser authentication because Next.js forwards those requests to Express.

| Setting                        | Production value                                                     |
| ------------------------------ | -------------------------------------------------------------------- |
| Express deployment             | `https://studiospace-server-house.vercel.app`                        |
| `CLIENT_URL`                   | `https://studiospace-client-web.vercel.app`                          |
| `BETTER_AUTH_URL`              | `https://studiospace-client-web.vercel.app`                          |
| Google authorized redirect URI | `https://studiospace-client-web.vercel.app/api/auth/callback/google` |

## Verify the deployment

| Check                                                  | Expected result                                       |
| ------------------------------------------------------ | ----------------------------------------------------- |
| Open the API root                                      | A JSON message identifies the StudioSpace API         |
| Open `/api/studios/featured`                           | A JSON array of featured studio cards                 |
| Open `/api/bookings/mine` while signed out             | `401 Unauthorized`                                    |
| Sign in from the live client and refresh the dashboard | The member’s workspace remains accessible             |
| Save a studio, then open **Saved studios**             | The selected studio appears in the member’s shortlist |

---

**Built by Foysal** · [Portfolio](https://foysaliio.vercel.app/) · [GitHub](https://github.com/foysaliio)
