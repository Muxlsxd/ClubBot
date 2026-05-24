require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();

app.use(express.json());
app.use(express.static("public"));

const LINE_TOKEN = process.env.CHANNEL_ACCESS_TOKEN;
const GAS_URL = process.env.GAS_API_URL;

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

const GROUP_ID_MAP = {
  "กลุ่มรวม": "C601df0ff42d495765355bcc4b1061acd", // <--- เอา Group ID ของกลุ่มรวมสโมสรมาวาง
  "ทะเบียน": "C43a4ea76f61d7ae6bc36e5b32a5817a4", 
  "ประธานโครงการ": "",
  "รองประธานโครงการ": "",
  "เลขานุการ": "",
  "เหรัญญิก": "",
  "สวัสดิการ": "",
  "พัสดุ": "",
  "Run script": "",
  "ช่างภาพ": "",
  "วิชาการ": "",
  "นันทนาการ": "",
  "ศิลป์": "",
  "เอกสาร": "",
  "พยาบาล": "",
  "สถานที่": "",
  "กราฟฟิก": "",
  "สปอนเซอร์": "",
  "ประชาสัมพันธ์": ""
};

app.post("/api", async (req, res) => {
  try {
    const payload = req.body;
    
    const gasRes = await axios.post(GAS_URL, payload);
    const result = gasRes.data;

    let formattedResult = { ok: false, error: 'เกิดข้อผิดพลาดไม่ทราบสาเหตุ' };
    
    if (result && result.status === 'success') {
      formattedResult = {
        ok: true,
        // 🌟 ดึง task data ให้รองรับทั้ง createTask และ updateTask
        task: (payload.action === 'createTask' || payload.action === 'updateTask') ? (result.data || {}) : {},
        users: payload.action === 'listUsers' ? (result.data || []) : [],
        tasks: payload.action === 'myTasks' ? (result.data || []) : []
      };
    } else if (result && result.status === 'error') {
      formattedResult = {
        ok: false,
        error: result.message || 'GAS หลังบ้านฟ้องว่ามี Error'
      };
    }

    // ==========================================
    // 🔔 1. ระบบแจ้งเตือนเมื่อ "สร้างงาน"
    // ==========================================
    if (payload.action === 'createTask' && formattedResult.ok) {
      const task = formattedResult.task;
      const targetGroupId = GROUP_ID_MAP[task.Department]; 
      
      if (payload.assigneeMode === 'open') {
        if (targetGroupId && targetGroupId.startsWith("C")) {
          const flexMsg = buildOpenTaskFlex(task);
          await callLineApi('push', { to: targetGroupId, messages: [flexMsg] });
          console.log(`✅ ส่งการ์ดแจ้งเตือนไปที่กลุ่ม ${task.Department} สำเร็จ`);
        } else {
          console.log(`⚠️ ไม่ได้ส่งการ์ด: ยังไม่ได้ตั้งค่า Group ID ให้กับฝ่าย ${task.Department}`);
        }
      } 
      else if (payload.assigneeMode === 'named') {
        const targetUserId = payload.assignedToUid;
        const assigneeName = payload.assignedTo;

        if (targetUserId) {
          await callLineApi('push', {
            to: targetUserId,
            messages: [{ type: "text", text: `🔔 คุณได้รับมอบหมายงานใหม่!\n📌 ชื่องาน: ${task.Task_Name}\n📅 กำหนดส่ง: ${task.Due_Date}\n📝 รายละเอียด: ${task.Description || '-'}` }]
          });
        }
        if (targetGroupId && targetGroupId.startsWith("C")) {
          await callLineApi('push', {
            to: targetGroupId,
            messages: [{ type: "text", text: `📢 มีงานใหม่ถูกมอบหมายแล้ว!\n📌 งาน: ${task.Task_Name}\n👤 ผู้รับผิดชอบ: ${assigneeName}` }]
          });
        }
      }
    }

    // ==========================================
    // 🔔 2. ระบบแจ้งเตือนเมื่อ "ส่งงานเสร็จ (Done)"
    // ==========================================
    if (payload.action === 'updateTask' && formattedResult.ok && payload.status === 'Done') {
      const task = formattedResult.task;
      const mainGroupId = GROUP_ID_MAP["กลุ่มรวม"]; 
      const creatorUid = task.Created_By; // คนสั่งงาน
      
      // จัดข้อความลิงก์ส่งงาน และหมายเหตุ (รับมาจากฟอร์มหน้าเว็บ)
      let linkText = payload.workLink ? `\n🔗 ลิงก์ส่งงาน: ${payload.workLink}` : '';
      let noteText = payload.note ? `\n📝 หมายเหตุ: ${payload.note}` : '';

      // 2.1 ประกาศลง "กลุ่มรวม"
      if (mainGroupId && mainGroupId.startsWith("C")) {
        await callLineApi('push', {
          to: mainGroupId,
          messages: [{ type: "text", text: `✅ [อัปเดตงานเสร็จสิ้น]\n📌 งาน: ${task.Task_Name}\n🏢 ฝ่าย: ${task.Department}${linkText}${noteText}` }]
        });
        console.log("✅ ประกาศงานเสร็จเข้ากลุ่มใหญ่สำเร็จ");
      }

      // 2.2 ทักแชทไปบอก "คนสั่งงาน" โดยตรง
      if (creatorUid && creatorUid.startsWith("U")) {
        await callLineApi('push', {
          to: creatorUid,
          messages: [{ type: "text", text: `🔔 งานที่คุณสั่งไว้สำเร็จแล้ว!\n📌 งาน: ${task.Task_Name}\n🏢 ฝ่าย: ${task.Department}${linkText}${noteText}` }]
        });
        console.log("✅ แจ้งเตือนคนสั่งงานส่วนตัวสำเร็จ");
      }
    }

    res.json(formattedResult);

  } catch (error) {
    console.error("❌ API Error:", error.message);
    res.status(500).json({ ok: false, error: error.message || 'ระบบหลังบ้านขัดข้อง' });
  }
});

app.post("/webhook", async (req, res) => {
  const events = req.body.events || [];

  for (const event of events) {
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

    if (event.type === "postback") {
      const params = new URLSearchParams(event.postback.data);
      const action = params.get("action");
      const taskId = params.get("taskId");
      const userId = event.source.userId;

      if (action === "claimTask") {
        try {
          const gasRes = await axios.post(GAS_URL, { action: "claimTask", taskId: taskId, userId: userId });
          const result = gasRes.data;
          
          const isSuccess = result && result.status === 'success';

          const replyText = isSuccess 
            ? `🎉 รับงานสำเร็จ: ${result.task.Task_Name}`
            : `❌ ไม่สามารถรับงานได้: ${result.message || 'ระบบขัดข้อง'}`;
            
          await callLineApi('reply', {
            replyToken: event.replyToken,
            messages: [{ type: "text", text: replyText }]
          });

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Club Bot Server Online on Port ${PORT}`);
});