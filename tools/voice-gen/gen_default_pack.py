"""
Generate G-Maiden's DEFAULT voice pack — Thai voice clips bundled with the
installer so the player gets an *actually intelligible* Maiden out of the box.

Why this exists: piper-voices upstream has no Thai voice, Windows SAPI Thai is
borderline unusable (the actual user pain after the in-game test), and Edge TTS'
Thai endpoint started rejecting unauthenticated requests in late 2025. Google
Translate's TTS endpoint (via `gtts`) still works, is free, has a usable Thai
voice, and gives 0 ms runtime latency once the clips are baked to disk.

Output:  src-tauri/voice-pack-default/{event}/{n}.mp3   (committed; the installer
ships them, audio.rs picks them up when the user hasn't dropped their own clips
into voice-cache/.)

Run once after editing the lines table:
    pip install gtts
    python tools/voice-gen/gen_default_pack.py
"""
import shutil
from pathlib import Path
from gtts import gTTS

ROOT = Path(__file__).resolve().parents[2] / "src-tauri" / "voice-pack-default"

LINES: dict[str, list[str]] = {
    # G-Signal critical: HP danger threshold crossed downward.
    "danger": [
        "ถอยก่อนค่ะเพื่อน เลือดเหลือน้อยแล้ว",
        "ระวัง เลือดน้อยมาก ถอยก่อนนะ",
        "ถอยเถอะค่ะ เลือดน้อยเกินไป",
    ],
    # G-Signal gank warning (capture.rs GANK_LINE).
    "gank": [
        "ระวังนะคะ ศัตรูหายไปจากแมพหลายตัว อาจมีแก๊งค์",
        "ระวังแก๊งค์ ศัตรูหายไปหลายคนแล้ว",
        "เอ๊ะ ศัตรูหายตัวกัน ระวังไว้ก่อนนะคะ",
    ],
    # Belief Revision retraction (revision_line / REVISION_LINES.dangerRetracted).
    "revision": [
        "เอ๊ะ เดี๋ยวก่อน ดูเหมือนจะปลอดภัยแล้วค่ะ",
        "อ้าว พลิกได้เก่งมาก ขอโทษที่เพิ่งบอกถอย",
        "เอ๊ะ โทษทีค่ะ คิดเร็วไปหน่อย ตามล่าต่อได้",
    ],
    # Persona — level up.
    "levelUp": [
        "ขึ้นเลเวลแล้วค่ะ สวยมาก ขยายอำนาจต่อเลย",
        "เลเวลใหม่นะคะ เก็บสกิลตามเพลนเดิม",
        "เลเวลขึ้นแล้ว ยังเก่งกว่ามูฟสปีดซีเอ็มอีกนะ",
    ],
    # Persona — kill.
    "kill": [
        "ฆ่าได้สวยค่ะ เก็บไปเรื่อยๆ",
        "นั่นน่ะ พิคของชั้น เอ๊ะ ของเพื่อนก็ได้",
        "ดีมากเลย รักษาแรงโมเมนตัมไว้",
    ],
    # Persona — death.
    "death": [
        "ตายแล้วเหรอคะ ไม่เป็นไรเดี๋ยวกลับมาใหม่",
        "เสียใจด้วยนะ มาวิเคราะห์กันว่าเกิดอะไรขึ้น",
        "เกิดขึ้นได้ค่ะ จดจังหวะแมพไว้นะ",
    ],
    # Persona — respawn.
    "respawn": [
        "กลับมาแล้ว ค่อยๆนะคะ",
        "ฟื้นแล้ว ดูแมพก่อนค่อยเดินออกนะ",
        "พร้อมแล้วใช่ไหม ไปด้วยกันค่ะ",
    ],
    # Persona — mana low.
    "manaLow": [
        "มานาเหลือน้อยแล้วค่ะ ระวังด้วย",
        "มานาใกล้หมด ถอยกลับฐานก่อนไหม",
    ],
    # G-Master advice ack (generic; the actual advice text is spoken live).
    "advice": [
        "ลองดูคำแนะนำนี้นะคะ",
        "นี่คือสิ่งที่ชั้นคิดว่าน่าจะดีค่ะ",
    ],
}


def main() -> None:
    if ROOT.exists():
        shutil.rmtree(ROOT)
    total = 0
    for event, takes in LINES.items():
        for i, text in enumerate(takes, start=1):
            out = ROOT / event / f"{i:02d}.mp3"
            out.parent.mkdir(parents=True, exist_ok=True)
            # slow=False gives natural pacing; gTTS Thai handles full sentences fine.
            gTTS(text=text, lang="th", slow=False).save(str(out))
            print(f"  + {event}/{out.name}  ({out.stat().st_size//1024} KB)  '{text[:32]}…'")
            total += 1
    print(f"\nwrote {total} clips → {ROOT}")


if __name__ == "__main__":
    main()
