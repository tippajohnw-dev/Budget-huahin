# หารกันเอง · Deploy package

ไฟล์หลักคือ `index.html` พร้อม Firebase config ที่ฝังไว้แล้ว ไม่ต้องถาม config ผู้ใช้ซ้ำ

## วิธี deploy บน GitHub Pages
1. เข้า repo `Budget-huahin`
2. อัปโหลด/แทนที่ไฟล์ทั้งหมดในโฟลเดอร์นี้ไปที่ root ของ repo:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - โฟลเดอร์ `icons/`
   - `firebase-rules.json` (เก็บไว้เป็น reference ไม่จำเป็นต้องเปิดผ่านเว็บ)
3. Commit changes
4. Settings → Pages → Deploy from a branch → main → /root → Save
5. URL: `https://tippajohnw-dev.github.io/Budget-huahin/`

## Firebase Rules
นำเนื้อหาใน `firebase-rules.json` ไปวางที่ Firebase Console → Realtime Database → Rules → Publish

หมายเหตุ: เพราะแอปนี้ยังไม่ใช้ Login/Auth จึงไม่สามารถกัน spam ได้ 100% แต่ rules ช่วย validate โครงสร้างข้อมูลและจำกัดขนาด/จำนวนเงิน ส่วนในหน้าเว็บมี client-side throttle กันการกดถี่จากผู้ใช้ทั่วไป
