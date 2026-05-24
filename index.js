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
    
    // ส่งข้อมูลไปหา Google Apps Script
    const gasRes = await axios.post(GAS_URL, payload);
    const result = gasRes.data;

    console.log("Result from GAS:", result); 

    // เริ่มต้นตัวแปรโครงสร้างเพื่อให้หน้าบ้านอ่านง่าย
    let formattedResult = { ok: false, error: 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ' };
    
    if (result && result.status === 'success') {
      formattedResult = {
        ok: true,
        task: payload.action === 'createTask' ? (result.data || {}) : {},
        users: payload.action === 'listUsers' ? (result.data || []) : [],
        tasks: payload.action === 'myTasks' ? (result.data || []) : []
      };
    } else if (result && result.status === 'error') {
      formattedResult = {
        ok: false,
        error: result.message || 'GAS หลังบ้านฟ้องว่ามี Error'
      };
    }
    
    // ถ้าสร้างงานสำเร็จ และเป็นงานแบบ "เปิดรับอาสา" ให้ยิง Flex Message ลงกลุ่ม
    if (payload.action === 'createTask' && formattedResult.ok && payload.assigneeMode === 'open') {
      const task = formattedResult.task;
      const groupId = result.groupId; 
      
      if (groupId) {
        const flexMsg = buildOpenTaskFlex(task);
        await callLineApi('push', { to: groupId, messages: [flexMsg] });
        console.log(`✅ ส่งการ์ดแจ้งเตือนไปที่กลุ่มสำเร็จ`);
      }
    }

    // ส่งชุดข้อมูลที่ประกอบร่างตรงกับหน้าบ้านต้องการกลับไป
    res.json(formattedResult);

  } catch (error) {
    console.error("❌ API Error:", error.message);
    res.status(500).json({ ok: false, error: error.message || 'ระบบหลังบ้านขัดข้อง' });
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

      if (text === "/groupid" || text === "ขอไอดีกลุ่ม") {
        const groupId = event.source.groupId;
        const replyText = groupId 
          ? `รหัสกลุ่มนี้คือ:\n${groupId}` 
          : "คุณต้องพิมพ์คำสั่งนี้ใน 'แชทกลุ่ม' เท่านั้นนะครับ";
          
        await callLineApi('reply', {
          replyToken: event.replyToken,
          messages: [{ type: "text", text: replyText }]
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
          const gasRes = await axios.post(GAS_URL, { action: "claimTask", taskId: taskId, userId: userId });
          const result = gasRes.data;
          
          // ตรวจสอบว่า GAS ส่ง success กลับมาหรือไม่
          const isSuccess = result && result.status === 'success';

          // แจ้งเตือนส่วนตัว
          const replyText = isSuccess 
            ? `🎉 รับงานสำเร็จ: ${result.task.Task_Name}`
            : `❌ ไม่สามารถรับงานได้: ${result.message || 'ระบบขัดข้อง'}`;
            
          await callLineApi('reply', {
            replyToken: event.replyToken,
            messages: [{ type: "text", text: replyText }]
          });

          // ประกาศลงกลุ่มเดิม
          const sourceTarget = event.source.groupId || event.source.roomId;
          if (isSuccess && sourceTarget) {
            const claimer = result.task.Assigned_To || 'สมาชิก';
            await callLineApi('push', {
              to: sourceTarget,
              messages: [{ type: "text", text: `🎉 คุณ ${claimer} เป็นฮีโร่รับงานนี้ไปแล้ว!\n📌 งาน: ${result.task.Task_Name}` }]
            });
          }
        } catch (error) {
          console.error("❌ Claim Task Error:", error.message);
        }
      }
    }
  }
  res.sendStatus(200);
});
// ==========================================
// 🚀 START SERVER
// ==========================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Club Bot Server Online on Port ${PORT}`);
});
