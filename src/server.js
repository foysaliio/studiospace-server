import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import { fromNodeHeaders, toNodeHandler } from "better-auth/node";
import { createAuth } from "./auth.js";

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

const auth = createAuth(db, client);

app.all("/api/auth/*splat", toNodeHandler(auth));

app.use(express.json());

app.get("/", (req, res) => {
  res.json({ message: "StudioSpace API is running" });
});

app.get("/api/studios/featured", async (req, res) => {
  try {
    const featuredStudios = await studios
      .find({})
      .sort({ createdAt: -1, _id: -1 })
      .limit(6)
      .toArray();

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

    const studioList = await studios
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .toArray();

    res.json(studioList);
  } catch (err) {
    console.error("Failed to load studios:", err.message);
    res.status(500).json({ message: "Could not load studios." });
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

app.post("/api/bookings", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

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

app.patch("/api/bookings/:id/cancel", async (req, res) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

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
});



app.listen(port, () => {
  console.log(`StudioSpace API running on port ${port}`);
});
