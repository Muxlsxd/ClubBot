const axios = require('axios');

// เอา URL ที่ได้จาก Apps Script มาใส่ตรงนี้
const GAS_URL = "https://script.google.com/macros/s/AKfycbzuF7fwfal7YvjPzKJ766oCJb5xnOMEAgTlY6mNj_xb--6E3bwj6sFzau4rBptB_aqUsw/exec"; 

async function testCreateTask() {
    console.log("⏳ กำลังส่งข้อมูลไปที่ Google Sheets...");
    
    try {
        const response = await axios.post(GAS_URL, {
            action: "create_task",
            Task_Name: "จัดเตรียมเก้าอี้ 50 ตัว",
            Description: "ใช้สำหรับห้องประชุมใหญ่ อาคารเรียนรวม",
            Created_By: "U001", // สมมติรหัสคนที่สั่ง
            Assigned_To: "OPEN", // เปิดรับอาสาสมัคร
            Department: "สถานที่",
            Status: "Open",
            Priority: "High",
            Due_Date: "2026-05-30"
        });

        console.log("✅ ผลลัพธ์จาก Sheet:", response.data);
    } catch (error) {
        console.error("❌ พังครับลูกพี่:", error.message);
    }
}

testCreateTask();