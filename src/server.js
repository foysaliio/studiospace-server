import express from "express";

const app = express();
const port = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.json({ message: "StudioSpace API is running" });
});

app.listen(port, () => {
  console.log(`StudioSpace API running on port ${port}`);
});
