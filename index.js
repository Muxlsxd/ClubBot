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
  line.middleware(config),
  async (req, res) => {
    try {
      const events = req.body.events;

      for (const event of events) {

        if (event.type !== "message") continue;
        if (event.message.type !== "text") continue;

        const text = event.message.text;

        await client.replyMessage({
          replyToken: event.replyToken,
          messages: [
            {
              type: "text",
              text: `คุณพิมพ์ว่า: ${text}`
            }
          ]
        });
      }

      res.sendStatus(200);

    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});