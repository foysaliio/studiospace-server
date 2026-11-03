import express from "express";
import { MongoClient } from "mongodb";
import "dotenv/config";

const app = express();
const port = process.env.PORT || 5000;
const client = new MongoClient(process.env.MONGODB_URI);

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

app.listen(port, () => {
  console.log(`StudioSpace API running on port ${port}`);
});
