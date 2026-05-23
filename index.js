require("dotenv").config();

const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());

app.get("/", (req, res) => {
  res.send("Club Bot Online");
});

app.post("/webhook", async (req, res) => {

  console.log(JSON.stringify(req.body, null, 2));

  const events = req.body.events || [];

  for (const event of events) {

    if (event.type !== "message") continue;
    if (event.message.type !== "text") continue;

    try {

      await axios.post(
        "https://api.line.me/v2/bot/message/reply",
        {
          replyToken: event.replyToken,
          messages: [
            {
              type: "text",
              text: `คุณพิมพ์ว่า: ${event.message.text}`
            }
          ]
        },
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
          }
        }
      );

      console.log("Reply success");

    } catch (err) {

      console.error("Reply error");

      if (err.response) {
        console.error(err.response.data);
      } else {
        console.error(err);
      }

    }
  }

  res.sendStatus(200);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on ${PORT}`);
});