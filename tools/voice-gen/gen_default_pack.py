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
    # Announcer — HP low (state event; softer than the G-Signal "danger" interrupt).
    "hpLow": [
        "เลือดเริ่มน้อยแล้วนะคะ หาจังหวะเติมด้วย",
        "เลือดต่ำแล้วค่ะ อย่าเพิ่งแลกนะ",
    ],
    # Announcer — match start.
    "match_start": [
        "เกมเริ่มแล้วค่ะ เมเด้นอยู่ตรงนี้นะ ไปด้วยกัน",
        "เริ่มแมตช์แล้วนะคะ ตั้งใจเก็บครีปช่วงต้นก่อน",
        "ขอให้เป็นเกมที่ดีนะคะ ชั้นจะคอยดูแมพให้เอง",
    ],
    # Announcer — first blood.
    "first_blood": [
        "เฟิร์สบลัดค่ะ เปิดเกมได้สวยมาก",
        "เลือดแรกของเกมแล้วค่ะ จังหวะดีมากเลย",
        "เฟิร์สบลัดแล้วนะคะ เก็บโมเมนตัมต่อเลย",
    ],
    # Announcer — multi-kills (18s window ladder).
    "double_kill": [
        "ดับเบิลคิลค่ะ สองติดกันเลย",
        "สองคิลรวดค่ะ สวยงามมาก",
    ],
    "triple_kill": [
        "ทริปเปิลคิลค่ะ สามติด เก่งมากเลย",
        "สามคิลติดกันแล้วนะคะ ทีมศัตรูเริ่มกลัวแล้ว",
    ],
    "ultra_kill": [
        "อัลตร้าคิลค่ะ สี่ติดแล้ว หยุดสวยขนาดนี้ไม่ไหวแล้วนะ",
        "สี่คิลรวดค่ะ เหลือเชื่อมากเลย",
    ],
    "rampage": [
        "แรมเพจค่ะ ห้าติด สุดยอดที่สุดในเกมนี้เลย",
        "แรมเพจแล้วนะคะ ขนาดชั้นโดนเนิร์ฟมูฟสปีดยังวิ่งตามไปเชียร์ทันเลย",
    ],
    # Announcer — kill-streak ladder (mirrors overlay STREAK_LABELS).
    "killing_spree": [
        "คิลลิ่งสปรีค่ะ ฟอร์มกำลังมาแล้วนะ",
        "ไล่เก็บต่อเนื่องเลยค่ะ รักษาจังหวะไว้",
    ],
    "dominating": [
        "โดมิเนตติ้งค่ะ คุมเกมอยู่หมัดเลยตอนนี้",
        "ครองเกมแล้วนะคะ อย่าประมาทล่ะ",
    ],
    "mega_kill": [
        "เมก้าคิลค่ะ โหดขึ้นเรื่อยๆ แล้วนะ",
        "สายฆ่าตัวจริงเลยค่ะ ระวังโดนรวมตัวจับนะ",
    ],
    "unstoppable": [
        "หยุดไม่อยู่แล้วค่ะตอนนี้ แต่ระวังโดนรุมนะคะ",
        "ไม่มีใครหยุดคุณได้แล้วค่ะ",
    ],
    "wicked_sick": [
        "โหดเกินไปแล้วค่ะเนี่ย เก่งจริงๆ",
        "ระดับนี้ชั้นต้องจดสถิติไว้เลยค่ะ",
    ],
    "monster_kill": [
        "มอนสเตอร์คิลค่ะ น่ากลัวมากแล้วตอนนี้",
        "กลายเป็นฝันร้ายของอีกทีมแล้วค่ะ",
    ],
    "godlike": [
        "ก็อดไลค์ค่ะ อีกนิดเดียวถึงขั้นสูงสุดแล้วนะ",
        "ระดับเทพแล้วค่ะ ทั้งแมพกำลังล่าคุณอยู่ ระวังด้วยนะ",
    ],
    "beyond_godlike": [
        "เหนือเทพไปแล้วค่ะ ใครก็หยุดไม่ได้แล้วจริงๆ",
        "สูงสุดแล้วค่ะ ชั้นภูมิใจมากเลยนะ แต่อย่าหลุดโฟกัสล่ะ",
    ],
}


def main(force: bool = False) -> None:
    # Idempotent by default: an event folder that already holds clips is kept
    # as-is (its committed mp3 bytes never churn), so a normal run only fills
    # in events that are missing entirely. `--force` regenerates everything.
    if force and ROOT.exists():
        shutil.rmtree(ROOT)
    total = skipped = 0
    for event, takes in LINES.items():
        event_dir = ROOT / event
        if event_dir.is_dir() and any(event_dir.glob("*.mp3")):
            print(f"  = {event}/ already has clips, skipped (use --force to regen)")
            skipped += 1
            continue
        for i, text in enumerate(takes, start=1):
            out = event_dir / f"{i:02d}.mp3"
            out.parent.mkdir(parents=True, exist_ok=True)
            # slow=False gives natural pacing; gTTS Thai handles full sentences fine.
            gTTS(text=text, lang="th", slow=False).save(str(out))
            print(f"  + {event}/{out.name}  ({out.stat().st_size//1024} KB)  '{text[:32]}…'")
            total += 1
    print(f"\nwrote {total} clips ({skipped} events kept) → {ROOT}")
    missing = [e for e in LINES if not any((ROOT / e).glob('*.mp3'))]
    if missing:
        raise SystemExit(f"events still without clips: {', '.join(missing)}")


if __name__ == "__main__":
    import sys
    main(force="--force" in sys.argv)
