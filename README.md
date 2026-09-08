# สมุดสลิป LINE

ระบบรับรูปสลิปจาก LINE กลุ่ม เก็บหลักฐานไว้ในเครื่อง และให้คนทำบัญชีตรวจยอดก่อนยืนยัน/ส่งออก CSV

## เริ่มทดลอง

ต้องใช้ Node.js 20 ขึ้นไป

```bash
cp .env.example .env
# แก้ค่าใน .env แล้วโหลดตัวแปรเข้าระบบ
set -a; source .env; set +a
npm start
```

เปิด `http://localhost:3000/?key=ค่า_ADMIN_KEY`

## ต่อกับ LINE

1. สร้าง LINE Official Account และเปิด Messaging API
2. ใน LINE Developers Console เปิด **Allow bot to join group chats**
3. ตั้ง Webhook URL เป็น HTTPS URL สาธารณะของระบบ ตามด้วย `/webhook`
4. ใส่ `LINE_CHANNEL_SECRET` และ `LINE_CHANNEL_ACCESS_TOKEN` ใน `.env`
5. เชิญบัญชีทางการเข้ากลุ่ม แล้วส่งรูปสลิป

ระบบตรวจ `x-line-signature` ทุกครั้ง, รับเฉพาะรูปที่มาจากกลุ่ม และกัน webhook ซ้ำด้วย message ID หากต้องล็อกเฉพาะบางกลุ่ม ให้ใส่ group ID ใน `LINE_ALLOWED_GROUP_IDS`

## ขอบเขตเวอร์ชันนี้

- เก็บภาพและข้อมูลในโฟลเดอร์ `uploads/` และ `data/` ซึ่งไม่ถูก commit
- ยอด/ธนาคาร/เวลา/เลขอ้างอิงให้ผู้ทำบัญชีตรวจและกรอก เพื่อไม่ให้ OCR ผิดแล้วลงบัญชีทันที
- เหมาะสำหรับทดลองหรือทีมขนาดเล็ก การใช้งานจริงควรย้ายไฟล์ไป object storage, ใช้ฐานข้อมูล, HTTPS และระบบล็อกอิน
- จุดต่อ OCR/Slip Verification อยู่หลังดาวน์โหลดภาพใน `processImage()` ควรตรวจข้อมูลกับผู้ให้บริการก่อนตั้งสถานะ `confirmed`

