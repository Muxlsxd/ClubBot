require("dotenv").config();

const express = require("express");
const line = require("@line/bot-sdk");

const app = express();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: config.channelAccessToken
});

app.get("/", (req, res) => {
  res.send("Club Bot Online");
});

app.post(
  "/webhook",
  express.json(),
  (req, res) => {

    console.log("===== WEBHOOK =====");
    console.log(JSON.stringify(req.body, null, 2));

    res.sendStatus(200);
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});
