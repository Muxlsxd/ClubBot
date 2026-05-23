require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();

// อนุญาตให้อ่านข้อมูล JSON และเปิดโฟลเดอร์ public สำหรับหน้าเว็บ LIFF
app.use(express.json());
app.use(express.static("public"));

const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const GAS_URL = process.env.GAS_API_URL;

// ==========================================
// 🛠️ ฟังก์ชันผู้ช่วย: ยิงข้อความ LINE
// ==========================================
async function callLineApi(mode, body) {
  const url = mode === 'reply' 
    ? 'https://api.line.me/v2/bot/message/reply' 
    : 'https://api.line.me/v2/bot/message/push';
  
  try {
    await axios.post(url, body, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${LINE_TOKEN}`
      }
    });
  } catch (err) {
    console.error(`❌ LINE API Error (${mode}):`, err.response ? JSON.stringify(err.response.data) : err.message);
  }
}

// สร้างหน้าตาการ์ด Flex Message เวลามีคนเปิดรับอาสาสมัคร
function buildOpenTaskFlex(task) {
  return {
    type: 'flex',
    altText: `งานเปิดรับ: ${task.Task_Name}`,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: '🚨 งานเปิดรับอาสา', weight: 'bold', size: 'lg', color: '#b00020' },
          { type: 'text', text: task.Task_Name, weight: 'bold', size: 'xl', wrap: true },
          { type: 'text', text: `ฝ่าย: ${task.Department}`, size: 'sm', color: '#666666', wrap: true },
          { type: 'text', text: `กำหนดส่ง: ${task.Due_Date}`, size: 'sm', color: '#666666', wrap: true },
          { type: 'text', text: task.Description || '-', size: 'sm', wrap: true, maxLines: 4 }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [
          {
            type: 'button', style: 'primary', color: '#1DB446',
            action: {
              type: 'postback',
              label: '🙋 รับงานนี้',
              data: `action=claimTask&taskId=${encodeURIComponent(task.Task_ID)}`
            }
          }
        ]
      }
    }
  };
}

// ==========================================
// 🌐 1. API หน้าบ้าน (รับข้อมูลจากหน้าเว็บ LIFF)
// ==========================================
app.post("/api", async (req, res) => {
  try {
    const payload = req.body;
    
    // โยนข้อมูลจากหน้าเว็บส่งไปให้ Google Apps Script บันทึกลง Sheet
    const gasRes = await axios.post(GAS_URL, payload);
    const result = gasRes.data;

    // ถ้าสร้างงานสำเร็จ และเป็นงานแบบ "เปิดรับอาสา" ให้เอา Group ID ที่ได้มา ยิง Flex Message ลงกลุ่ม
    if (payload.action === 'createTask' && result.ok && payload.assigneeMode === 'open') {
      const task = result.task;
      const groupId = result.groupId; // รหัสกลุ่มจากแท็บ Config ใน Google Sheets
      
      if (groupId) {
        const flexMsg = buildOpenTaskFlex(task);
        await callLineApi('push', { to: groupId, messages: [flexMsg] });
        console.log(`✅ ส่งการ์ดแจ้งเตือนไปที่กลุ่ม ${task.Department} สำเร็จ`);
      } else {
        console.log(`⚠️ ไม่พบ Group ID สำหรับฝ่าย ${task.Department} ใน Sheet`);
      }
    }

    // ตอบกลับผลลัพธ์ให้หน้าเว็บ LIFF แสดงให้ผู้ใช้เห็น
    res.json(result);

  } catch (error) {
    console.error("❌ API Error:", error.message);
    res.status(500).json({ ok: false, error: 'ระบบขัดข้อง' });
  }
});

// ==========================================
// 🤖 2. LINE WEBHOOK (รับข้อความแชทจากผู้ใช้)
// ==========================================
app.post("/webhook", async (req, res) => {
  const events = req.body.events || [];

  for (const event of events) {
    // ---- กรณีผู้ใช้พิมพ์ข้อความมา ----
    if (event.type === "message" && event.message.type === "text") {
      const text = event.message.text.trim().toLowerCase();
      
      if (text === "/help" || text === "help") {
        await callLineApi('reply', {
          replyToken: event.replyToken,
          messages: [{ type: "text", text: "ยินดีต้อนรับ! กรุณากดปุ่มเปิดหน้า LIFF เพื่อเริ่มใช้งานระบบครับ" }]
        });
      }
    }

    // ---- กรณีผู้ใช้กดปุ่ม "รับงานนี้" จากการ์ด Flex Message ----
    if (event.type === "postback") {
      const params = new URLSearchParams(event.postback.data);
      const action = params.get("action");
      const taskId = params.get("taskId");
      const userId = event.source.userId;

      if (action === "claimTask") {
        try {
          // ส่งคำสั่งให้ GAS เปลี่ยนสถานะงานใน Sheet
          const gasRes = await axios.post(GAS_URL, {
            action: "claimTask",
            taskId: taskId,
            userId: userId
          });
          const result = gasRes.data;

          // แจ้งเตือนแบบส่วนตัวให้คนที่กดรับงาน
          const replyText = result.ok 
            ? `🎉 รับงานสำเร็จ: ${result.task.Task_Name}`
            : `❌ ไม่สามารถรับงานได้: ${result.error}`;
            
          await callLineApi('reply', {
            replyToken: event.replyToken,
            messages: [{ type: "text", text: replyText }]
          });

          // ประกาศความเท่ลงในกลุ่มเดิมที่กดปุ่ม
          const sourceTarget = event.source.groupId || event.source.roomId;
          if (result.ok && sourceTarget) {
            const claimer = result.task.Assigned_To || 'สมาชิก';
            await callLineApi('push', {
              to: sourceTarget,
              messages: [{ type: "text", text: `🎉 ${claimer} เป็นฮีโร่รับงานนี้ไปแล้ว!\n📌 งาน: ${result.task.Task_Name}` }]
            });
          }
        } catch (error) {
          console.error("❌ Claim Task Error:", error.message);
        }
      }
    }
  }

  // ส่งสถานะ 200 กลับให้เซิร์ฟเวอร์ LINE เสมอ (ห้ามลบ)
  res.sendStatus(200);
});

// ==========================================
// 🚀 START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Club Bot Server Online on Port ${PORT}`);
});