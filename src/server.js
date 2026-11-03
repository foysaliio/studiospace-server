import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";
import "dotenv/config";
import { toNodeHandler } from "better-auth/node";
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

app.listen(port, () => {
  console.log(`StudioSpace API running on port ${port}`);
});
