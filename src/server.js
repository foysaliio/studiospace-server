import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { createAuth } from "./auth.js";
import cookieParser from "cookie-parser";
import { createMutationAuth } from "./mutation-auth.js";

const app = express();
const port = process.env.PORT || 5000;
const client = new MongoClient(process.env.MONGODB_URI);

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
    throw err;
  }
}

const connectedToMongoDB = await connectToMongoDB();

const db = connectedToMongoDB.db(process.env.MONGODB_DB_NAME);
const studios = db.collection("studios");

await studios.createIndex({ listingKey: 1 }, { unique: true, sparse: true });

const auth = createAuth(db, client);

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.use(cookieParser());

const mutationAuth = createMutationAuth(auth);

app.post("/api/mutation-token", mutationAuth.issueCookie);

app.get("/", (req, res) => {
  res.json({ message: "StudioSpace API is running" });
});

function getStudioCards(filter, limit) {
  const pipeline = [{ $match: filter }, { $sort: { createdAt: -1, _id: -1 } }];

  if (limit !== undefined) {
    pipeline.push({ $limit: limit });
  }

  pipeline.push(
    {
      $lookup: {
        from: "reviews",
        let: { studioId: { $toString: "$_id" } },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$studioId", "$$studioId"] },
            },
          },
          {
            $group: {
              _id: null,
              averageRating: { $avg: "$rating" },
            },
          },
        ],
        as: "reviewStats",
      },
    },
    {
      $set: {
        rating: {
          $ifNull: [
            { $arrayElemAt: ["$reviewStats.averageRating", 0] },
            { $ifNull: ["$rating", 0] },
          ],
        },
      },
    },
    { $unset: "reviewStats" },
  );

  return studios.aggregate(pipeline).toArray();
}

app.get("/api/studios/featured", async (req, res) => {
  try {
    const featuredStudios = await getStudioCards({}, 6);
    res.json(featuredStudios);
  } catch (err) {
    console.error("Failed to load featured studios:", err.message);
    res.status(500).json({ message: "Could not load featured studios." });
  }
});

app.get("/api/studios", async (req, res) => {
  try {
    const category = req.query.category;
    const filter = {};

    if (typeof category === "string" && category.trim() !== "") {
      filter.category = category.trim();
    }

    const studioList = await getStudioCards(filter);
    res.json(studioList);
  } catch (err) {
    console.error("Failed to load studios:", err.message);
    res.status(500).json({ message: "Could not load studios." });
  }
});

app.get("/api/studios/mine", async (req, res) => {
  res.set("Cache-Control", "private, no-store");

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({
        message: "Please log in to view your studio listings.",
      });
    }

    const myStudios = await studios
      .find({ ownerId: session.user.id })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();

    return res.json(myStudios);
  } catch (err) {
    console.error("Failed to load your studio listings:", err.message);
    return res.status(500).json({
      message: "Could not load your studio listings.",
    });
  }
});

app.get("/api/studios/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid studio ID." });
    }

    const studio = await studios.findOne({ _id: new ObjectId(id) });

    if (!studio) {
      return res.status(404).json({ message: "Studio not found." });
    }

    res.json(studio);
  } catch (err) {
    console.error("Failed to load studio:", err.message);
    res.status(500).json({ message: "Could not load studio." });
  }
});

app.get("/api/studios/:id/reviews", async (req, res) => {
  try {
    const reviews = await db
      .collection("reviews")
      .find({ studioId: req.params.id })
      .sort({ createdAt: -1 })
      .toArray();

    res.json(reviews);
  } catch (err) {
    console.error("Failed to load studio reviews:", err.message);
    res.status(500).json({ message: "Could not load studio reviews." });
  }
});

app.post(
  "/api/studios/:id/reviews",
  mutationAuth.requireCookie,
  async (req, res) => {
    try {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
      });

      if (!session?.user) {
        return res
          .status(401)
          .json({ message: "Please log in to leave a review." });
      }

      const { id } = req.params;
      const { rating, comment } = req.body ?? {};

      if (!/^[a-f\d]{24}$/i.test(id)) {
        return res.status(400).json({ message: "Invalid studio ID." });
      }

      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res
          .status(400)
          .json({ message: "Choose a rating from 1 to 5." });
      }

      const text = typeof comment === "string" ? comment.trim() : "";

      if (!text || text.length > 1000) {
        return res.status(400).json({
          message: "Write a review between 1 and 1000 characters.",
        });
      }

      const studio = await db
        .collection("studios")
        .findOne({ _id: new ObjectId(id) }, { projection: { _id: 1 } });

      if (!studio) {
        return res.status(404).json({ message: "Studio not found." });
      }

      const review = {
        studioId: studio._id.toHexString(),
        reviewerName: session.user.name,
        rating,
        comment: text,
        createdAt: new Date(),
      };

      const result = await db.collection("reviews").insertOne(review);

      return res.status(201).json({ _id: result.insertedId, ...review });
    } catch (err) {
      console.error("Failed to save studio review:", err.message);
      return res.status(500).json({ message: "Could not save your review." });
    }
  },
);

app.get("/api/bookings/mine", async (req, res) => {
  res.set("Cache-Control", "private, no-store");

  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session?.user) {
      return res.status(401).json({
        message: "Please log in to view your bookings.",
      });
    }

    const myBookings = await db
      .collection("bookings")
      .find({ userId: session.user.id })
      .sort({ createdAt: -1, _id: -1 })
      .toArray();

    res.json(myBookings);
  } catch (err) {
    console.error("Failed to load bookings:", err.message);
    res.status(500).json({ message: "Could not load your bookings." });
  }
});

app.post("/api/bookings", mutationAuth.requireCookie, async (req, res) => {
  try {
    const session = req.authSession;

    if (!session?.user) {
      return res.status(401).json({
        message: "Please log in to book a studio.",
      });
    }

    const { studioId, startAt, hours } = req.body ?? {};

    if (typeof studioId !== "string" || !ObjectId.isValid(studioId)) {
      return res.status(400).json({ message: "Invalid studio ID." });
    }

    if (!Number.isSafeInteger(hours) || hours < 1) {
      return res.status(400).json({
        message: "Choose a duration of at least one whole hour.",
      });
    }

    // The client sends the selected date and time using toISOString().
    const startsAt = new Date(typeof startAt === "string" ? startAt : "");

    if (
      !Number.isFinite(startsAt.getTime()) ||
      startsAt.toISOString() !== startAt
    ) {
      return res.status(400).json({ message: "Choose a valid start time." });
    }

    if (startsAt.getTime() <= Date.now()) {
      return res.status(400).json({ message: "Choose a future start time." });
    }

    const endsAt = new Date(startsAt.getTime() + hours * 60 * 60 * 1000);

    if (!Number.isFinite(endsAt.getTime())) {
      return res.status(400).json({ message: "Choose a valid duration." });
    }

    const studio = await studios.findOne({ _id: new ObjectId(studioId) });

    if (!studio) {
      return res.status(404).json({ message: "Studio not found." });
    }

    const bookings = db.collection("bookings");
    const studioKey = studio._id.toHexString();

    const conflictingBooking = await bookings.findOne({
      studioId: studioKey,
      status: "Confirmed",
      startAt: { $lt: endsAt },
      endAt: { $gt: startsAt },
    });

    if (conflictingBooking) {
      return res.status(409).json({
        message:
          "This studio is already booked during that time. Choose another slot.",
      });
    }

    const booking = {
      userId: session.user.id,
      studioId: studioKey,
      studioTitle: studio.title,
      startAt: startsAt,
      endAt: endsAt,
      hours,
      hourlyRate: studio.hourlyRate,
      studioFee: Math.round(studio.hourlyRate * hours * 100) / 100,
      securityDeposit: studio.securityDeposit,
      status: "Pending",
      createdAt: new Date(),
    };

    const result = await bookings.insertOne(booking);

    return res.status(201).json({
      message: "Booking request sent.",
      bookingId: result.insertedId,
      status: booking.status,
    });
  } catch (err) {
    console.error("Failed to create booking:", err.message);
    return res.status(500).json({ message: "Could not create your booking." });
  }
});

app.patch(
  "/api/bookings/:id/cancel",
  mutationAuth.requireCookie,
  async (req, res) => {
    try {
      const session = req.authSession;

      if (!session?.user) {
        return res.status(401).json({
          message: "Please log in to cancel your booking.",
        });
      }

      const { id } = req.params;

      if (!ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid booking ID." });
      }

      const result = await db.collection("bookings").updateOne(
        {
          _id: new ObjectId(id),
          userId: session.user.id,
          status: "Pending",
        },
        {
          $set: {
            status: "Cancelled",
            cancelledAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return res.status(409).json({
          message: "You can only cancel your own pending bookings.",
        });
      }

      return res.json({
        message: "Booking cancelled.",
        status: "Cancelled",
      });
    } catch (err) {
      console.error("Failed to cancel booking:", err.message);
      return res.status(500).json({ message: "Could not cancel booking." });
    }
  },
);

app.post("/api/studios", mutationAuth.requireCookie, async (req, res) => {
  try {
    const session = req.authSession;

    if (!session?.user) {
      return res.status(401).json({
        message: "Please log in to add a studio.",
      });
    }

    const {
      title,
      category,
      location,
      overview,
      imageUrl,
      hourlyRate,
      securityDeposit,
      maxCapacity,
      amenities = [],
    } = req.body ?? {};

    const requiredText = [title, location, overview, imageUrl];

    if (
      requiredText.some((value) => typeof value !== "string" || !value.trim())
    ) {
      return res.status(400).json({
        message: "Enter a title, location, overview and image URL.",
      });
    }

    const categories = [
      "Photo Studio",
      "Film Stage",
      "Podcast Lounge",
      "Music Suite",
      "Workshop",
    ];

    if (!categories.includes(category)) {
      return res
        .status(400)
        .json({ message: "Choose a valid studio category." });
    }

    if (!URL.canParse(imageUrl) || new URL(imageUrl).protocol !== "https:") {
      return res
        .status(400)
        .json({ message: "Enter a valid HTTPS image URL." });
    }

    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      return res
        .status(400)
        .json({ message: "Hourly rate must be more than zero." });
    }

    if (!Number.isFinite(securityDeposit) || securityDeposit < 0) {
      return res
        .status(400)
        .json({ message: "Security deposit must be zero or more." });
    }

    if (!Number.isSafeInteger(maxCapacity) || maxCapacity < 1) {
      return res
        .status(400)
        .json({ message: "Capacity must be at least one person." });
    }

    if (
      !Array.isArray(amenities) ||
      amenities.some((item) => typeof item !== "string")
    ) {
      return res
        .status(400)
        .json({ message: "Enter amenities as a list of names." });
    }

    const studio = {
      title: title.trim(),
      category,
      location: location.trim(),
      overview: overview.trim(),
      imageUrl: imageUrl.trim(),
      hourlyRate,
      securityDeposit,
      maxCapacity,
      amenities: amenities.map((item) => item.trim()).filter(Boolean),
      ownerId: session.user.id,
      ownerName: session.user.name,
      ownerEmail: session.user.email,
      rating: 0,
      createdAt: new Date(),
    };

    const existingStudio = await studios.findOne(
      {
        ownerId: session.user.id,
        title: studio.title,
        location: studio.location,
      },
      {
        collation: { locale: "en", strength: 2 },
        projection: { _id: 1 },
      },
    );

    if (existingStudio) {
      return res.status(409).json({
        message: "You already have a studio with this name at this location.",
      });
    }

    studio.listingKey = JSON.stringify([
      session.user.id,
      studio.title.toLowerCase(),
      studio.location.toLowerCase(),
    ]);

    const result = await studios.insertOne(studio);

    return res.status(201).json({
      message: "Studio added.",
      studioId: result.insertedId,
    });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.listingKey) {
      return res.status(409).json({
        message: "You already have a studio with this name at this location.",
      });
    }

    console.error("Failed to add studio:", err.message);
    return res.status(500).json({ message: "Could not add studio." });
  }
});

app.put("/api/studios/:id", mutationAuth.requireCookie, async (req, res) => {
  try {
    const session = req.authSession;

    if (!session?.user) {
      return res.status(401).json({
        message: "Please log in to update your studio.",
      });
    }

    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid studio ID." });
    }

    const ownerFilter = {
      _id: new ObjectId(req.params.id),
      ownerId: session.user.id,
    };

    const current = await studios.findOne(ownerFilter);

    if (!current) {
      return res.status(404).json({
        message: "Studio not found in your listings.",
      });
    }

    const {
      title,
      category,
      location,
      overview,
      imageUrl,
      hourlyRate,
      securityDeposit,
      maxCapacity,
      amenities,
    } = req.body ?? {};

    const requiredText = [title, location, overview, imageUrl];

    if (
      requiredText.some((value) => typeof value !== "string" || !value.trim())
    ) {
      return res.status(400).json({
        message: "Enter a title, location, overview and image URL.",
      });
    }

    const categories = [
      "Photo Studio",
      "Film Stage",
      "Podcast Lounge",
      "Music Suite",
      "Workshop",
    ];

    if (!categories.includes(category)) {
      return res
        .status(400)
        .json({ message: "Choose a valid studio category." });
    }

    if (!URL.canParse(imageUrl) || new URL(imageUrl).protocol !== "https:") {
      return res
        .status(400)
        .json({ message: "Enter a valid HTTPS image URL." });
    }

    if (!Number.isFinite(hourlyRate) || hourlyRate <= 0) {
      return res
        .status(400)
        .json({ message: "Hourly rate must be more than zero." });
    }

    if (!Number.isFinite(securityDeposit) || securityDeposit < 0) {
      return res
        .status(400)
        .json({ message: "Security deposit must be zero or more." });
    }

    if (!Number.isSafeInteger(maxCapacity) || maxCapacity < 1) {
      return res
        .status(400)
        .json({ message: "Capacity must be at least one person." });
    }

    if (
      !Array.isArray(amenities) ||
      amenities.some((item) => typeof item !== "string")
    ) {
      return res
        .status(400)
        .json({ message: "Enter amenities as a list of names." });
    }

    const cleanTitle = title.trim();
    const cleanLocation = location.trim();

    const listingKey = JSON.stringify([
      session.user.id,
      cleanTitle.toLowerCase(),
      cleanLocation.toLowerCase(),
    ]);

    // Check other listings only when the studio's name or location changes.
    const nameOrLocationChanged =
      current.title.trim().toLowerCase() !== cleanTitle.toLowerCase() ||
      current.location.trim().toLowerCase() !== cleanLocation.toLowerCase();

    if (nameOrLocationChanged) {
      const duplicate = await studios.findOne(
        {
          _id: { $ne: current._id },
          ownerId: session.user.id,
          title: cleanTitle,
          location: cleanLocation,
        },
        {
          collation: { locale: "en", strength: 2 },
          projection: { _id: 1 },
        },
      );

      if (duplicate) {
        return res.status(409).json({
          message: "You already have a studio with this name at this location.",
        });
      }
    }

    const changes = {
      title: cleanTitle,
      category,
      location: cleanLocation,
      overview: overview.trim(),
      imageUrl: imageUrl.trim(),
      hourlyRate,
      securityDeposit,
      maxCapacity,
      amenities: amenities.map((item) => item.trim()).filter(Boolean),
      updatedAt: new Date(),
    };

    // Older listings may predate the unique key. A rate-only edit still works.
    if (nameOrLocationChanged || current.listingKey) {
      changes.listingKey = listingKey;
    }

    const result = await studios.updateOne(ownerFilter, { $set: changes });

    if (result.matchedCount === 0) {
      return res.status(404).json({ message: "Studio no longer exists." });
    }

    return res.json({ message: "Studio updated." });
  } catch (err) {
    if (err.code === 11000 && err.keyPattern?.listingKey) {
      return res.status(409).json({
        message: "You already have a studio with this name at this location.",
      });
    }

    console.error("Failed to update studio:", err.message);
    return res.status(500).json({ message: "Could not update studio." });
  }
});

app.delete("/api/studios/:id", mutationAuth.requireCookie, async (req, res) => {
  try {
    const session = req.authSession;

    if (!session?.user) {
      return res.status(401).json({
        message: "Please log in to delete your studio.",
      });
    }

    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ message: "Invalid studio ID." });
    }

    const result = await studios.deleteOne({
      _id: new ObjectId(req.params.id),
      ownerId: session.user.id,
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        message: "Studio not found in your listings.",
      });
    }

    return res.json({ message: "Studio deleted." });
  } catch (err) {
    console.error("Failed to delete studio:", err.message);
    return res.status(500).json({ message: "Could not delete studio." });
  }
});

app.listen(port, () => {
  console.log(`StudioSpace API running on port ${port}`);
});
