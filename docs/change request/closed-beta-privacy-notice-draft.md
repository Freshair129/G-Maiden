# G-Maiden Closed Beta — Privacy Notice & Data Consent (Draft)
## คำชี้แจงความเป็นส่วนตัวและการยินยอมข้อมูล G-Maiden Closed Beta (ร่าง)

*สถานะ: ร่างสำหรับการตรวจพิจารณาทางกฎหมาย (Draft for Legal Review)*  
*วันที่มีผลบังคับใช้: [ระบุวันที่]*  

---

### TH: ภาษาไทย

ผู้พัฒนา G-Maiden ("เรา") ให้ความสำคัญอย่างยิ่งต่อความปลอดภัยของข้อมูลส่วนบุคคลของคุณ คำชี้แจงความเป็นส่วนตัวนี้ชี้แจงถึงวิธีการรวบรวม ใช้งาน และประมวลผลข้อมูลส่วนบุคคลของคุณสำหรับการมีส่วนร่วมในระบบแชร์ข้อมูลแมตช์ (Data Contribution Flywheel) เพื่อแลกรับ Shards

#### 1. การยินยอมแยกต่างหากจากระบบบัญชี (Separate Consent)
*   การยินยอมรับนโยบายนี้เป็นไปโดยสมัครใจ และเป็นการขอความยินยอมเพื่อรวบรวมข้อมูลแมตช์และการประมวลผลข้อมูลทางสถิติแยกต่างหากจากการสมัครบัญชี GID (Google Sign-In) 
*   คุณไม่จำเป็นต้องยินยอมแชร์ข้อมูลแมตช์เพื่อใช้งานฟังก์ชันพื้นฐานของเดค แต่การปิดการยินยอมนี้จะส่งผลให้คุณไม่สามารถแชร์แมตช์เพื่อรับ Shards ฟรีได้

#### 2. ข้อมูลที่มีการรวบรวมและจุดประสงค์
*   **ข้อมูลแมตช์เกม (Dota 2 Match Data):** เมื่อคุณเลือกกดแชร์แมตช์ ระบบจะส่งเพียง ID แมตช์เกม (Match ID) ไปตรวจสอบกับหน่วยงานตรวจสอบภายนอก (OpenDota API) เพื่อตรวจสอบความถูกต้องของข้อมูลสถิติของฮีโร่ ผลการเล่น และการคำนวณ Shards ที่จะได้รับ
*   **ข้อมูลบัญชี Steam:** ใช้เพื่อผูกโยงข้อมูลตัวตนในเกมของคุณกับการมอบ Shards
*   **ไม่มีการเก็บข้อมูลดิบและพิกัดแผนที่ (Local Privacy):** ข้อมูลดิบจากแอปพลิเคชันของคุณ (G-Log, ภาพจับหน้าจอ และข้อมูลพิกัดการเดินของฮีโร่แบบเรียลไทม์) จะถูกประมวลผลและเก็บไว้บนฮาร์ดไดรฟ์เครื่องคอมพิวเตอร์ของคุณเท่านั้น **จะไม่มีการส่งออกหรือเก็บพิกัดแผนที่การเล่นเหล่านี้ขึ้นสู่ระบบคลาวด์ของเราอย่างเด็ดขาด**

#### 3. สิทธิ์ในการเพิกถอนและการลบข้อมูลย้อนหลัง (Revocable & Deletable)
*   คุณมีสิทธิ์ถอนความยินยอมในการเก็บข้อมูลนี้เมื่อใดก็ได้ผ่านหน้าระบบการตั้งค่า (Settings -> Privacy)
*   คุณมีสิทธิ์ส่งคำขอเพื่อลบประวัติแมตช์ ข้อมูลธุรกรรม และข้อมูลตัวตนทั้งหมดของคุณออกจากเซิร์ฟเวอร์ Supabase gstore ย้อนหลังได้ทันที โดยระบบจะลบข้อมูลออกอย่างถาวรโดยไม่มีการสำรองข้อมูลไว้

---

### EN: English

We value your privacy. This Privacy Notice and Consent outlines how we collect, process, and protect your personal data in connection with the G-Maiden Data Contribution Flywheel (faucet).

#### 1. Separate & Independent Consent
*   Consenting to match data collection is completely optional and is requested **separately from your primary GID Account Registration**.
*   You may refuse to share your match data and still use the core overlay features, but you will be unable to earn Shards via the match sharing portal.

#### 2. Data Collected & Purpose
*   **Dota 2 Match Data:** When you explicitly click "Share Match", the platform transmits your Match ID to verify gameplay statistics, KDA, and performance metrics via the OpenDota API to compute your Shard reward.
*   **Steam Account ID:** Linked to verify that the submitted matches belong to your account.
*   **Local-Only Raw Data:** Your local coordinate tracking (G-Log), screen capture frames, and real-time movement traces are strictly stored on-device. **We never upload raw game logs, minimap screenshots, or active coordinate sequences to our cloud brain.**

#### 3. Revocation and Right to Deletion
*   You can revoke your consent at any time via the Settings -> Privacy dashboard.
*   You hold the right to retroactively request the complete deletion of your linked Steam identity, transactions ledger, and GID metadata from the Supabase `gstore` backend. Once requested, this deletion is absolute and permanent.
