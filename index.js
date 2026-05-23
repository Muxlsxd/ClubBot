const express = require("express");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Club Bot Online");
});

app.post("/webhook", (req, res) => {

  console.log("===== WEBHOOK RECEIVED =====");
  console.log(JSON.stringify(req.body, null, 2));

  res.status(200).send("OK");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});