<div align="center">

# StudioSpace API

### The booking and listing service behind StudioSpace

An Express API for a peer-to-peer creative studio marketplace. It serves the public studio catalogue and manages the listings, reservations, reviews, and saved spaces associated with user accounts.

[**Client repository**](https://github.com/foysaliio/studiospace-client) · [**API overview**](#api-overview) · [**Run locally**](#run-locally)

![Node.js](https://img.shields.io/badge/Node.js-24-285C38?style=flat-square&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express-JavaScript-252525?style=flat-square&logo=express&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-176B45?style=flat-square&logo=mongodb&logoColor=white)
![Better Auth](https://img.shields.io/badge/Better_Auth-Sessions-24241F?style=flat-square)

</div>

---

## What the API handles

| Area                 | Responsibility                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| **Studio catalogue** | Return featured studios, filter listings by category, and load an individual space                |
| **Host listings**    | Validate studio details, associate listings with their owner, and handle updates and deletion     |
| **Reservations**     | Record booking requests, return the current user's reservations, and handle pending cancellations |
| **Reviews**          | Store ratings and comments and return reviews for the requested studio                            |
| **Saved studios**    | Add or remove a studio from the signed-in user's shortlist                                        |
| **Authentication**   | Manage email/password and Google sign-in through Better Auth and its MongoDB adapter              |

## API overview

The default local base URL is `http://localhost:5000`.

| Method   | Endpoint                   | Purpose                                         |
| -------- | -------------------------- | ----------------------------------------------- |
| `GET`    | `/api/studios/featured`    | Return up to six featured studio cards          |
| `GET`    | `/api/studios`             | List studios, optionally filtered by `category` |
| `GET`    | `/api/studios/:id`         | Get one studio's details                        |
| `GET`    | `/api/studios/:id/reviews` | Read studio reviews, newest first               |
| `POST`   | `/api/studios/:id/reviews` | Submit a studio review                          |
| `GET`    | `/api/studios/mine`        | List studios owned by the signed-in user        |
| `POST`   | `/api/studios`             | Create a studio listing                         |
| `PUT`    | `/api/studios/:id`         | Update a studio listing                         |
| `DELETE` | `/api/studios/:id`         | Delete a listing owned by the current user      |
| `POST`   | `/api/bookings`            | Request a reservation                           |
| `GET`    | `/api/bookings/mine`       | Get the current user's bookings, newest first   |
| `GET`    | `/api/saved-studios`       | Load the current user's saved studio cards      |
| `PUT`    | `/api/saved-studios/:id`   | Save a studio                                   |
| `DELETE` | `/api/saved-studios/:id`   | Remove a saved studio                           |

For example, open this URL locally to browse podcast spaces:

```text
http://localhost:5000/api/studios?category=Podcast%20Lounge
```

## How a listing is created

1. The API checks the user's session and mutation cookie.
2. It validates the title, category, location, overview, HTTPS image URL, hourly rate, deposit, capacity, and amenities.
3. It takes the owner's ID, name, and email from the authenticated session.
4. It checks whether that owner already has a studio with the same name and location.
5. A successful insert returns `201` with the new studio ID. A duplicate listing returns `409`.

The client can also upload a cover photo through its Next.js ImgBB route. The Express API receives the resulting image URL and stores it with the listing.

## Sessions and protected requests

Better Auth manages the user session. For protected mutations, the StudioSpace client also obtains a short-lived JWT cookie named `studiospace_mutation`.

| Check            | Behaviour                                                                    |
| ---------------- | ---------------------------------------------------------------------------- |
| Request origin   | Must match the configured client origin                                      |
| Mutation cookie  | HTTP-only, scoped to `/api`, with a five-minute lifetime                     |
| Token validation | Checks the signature, issuer, audience, and expiration                       |
| Session binding  | The token's user ID and session ID must match the active Better Auth session |
| Ownership        | Listing deletion matches both the studio ID and the current user's ID        |

A disallowed origin receives `403`. An allowed-origin mutation with missing or expired authorization receives `401`. These checks are implemented in `src/mutation-auth.js`.

## Run locally

Use Node.js 24, npm, and a MongoDB database. The example uses port `5000` for Express and port `3000` for the Next.js client.

1. Clone the server and install dependencies.

   ```bash
   git clone https://github.com/foysaliio/studiospace-server.git
   cd studiospace-server
   npm install
   ```

2. Create `.env` in the server repository root. Set the MongoDB connection variable used by `src/server.js` to your connection string. Configure the database name as well if your setup reads it from the environment.

3. Add the server and authentication settings.

   ```env
   PORT=5000
   CLIENT_URL=http://localhost:3000
   BETTER_AUTH_URL=http://localhost:5000
   BETTER_AUTH_SECRET=replace_with_a_random_auth_secret
   MUTATION_JWT_SECRET=replace_with_a_separate_random_jwt_secret
   GOOGLE_CLIENT_ID=your_google_oauth_client_id
   GOOGLE_CLIENT_SECRET=your_google_oauth_client_secret
   ```

   For the password-reset email integration, configure `GMAIL_USER` and `GMAIL_APP_PASSWORD` in the server environment.

4. Start the API from the repository root.

   ```bash
   node src/server.js
   ```

5. Open **http://localhost:5000** to check the server, then open **http://localhost:5000/api/studios** to check the catalogue endpoint. An empty database can return an empty array. Publish a listing through the client to add your first studio.

## Source guide

| File                   | What to look for                                                               |
| ---------------------- | ------------------------------------------------------------------------------ |
| `src/server.js`        | Express configuration, MongoDB access, and application routes                  |
| `src/auth.js`          | Better Auth configuration, MongoDB adapter, Google sign-in, and email settings |
| `src/mutation-auth.js` | Mutation cookie issuance and request verification                              |

---

Built by [Foysal](https://github.com/foysaliio) · [StudioSpace client](https://github.com/foysaliio/studiospace-client)
