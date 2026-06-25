from PIL import Image, ImageDraw, ImageFont
img = Image.new("RGB", (260, 320), (22, 32, 26))  # dark scoreboard green
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype("arialbd.ttf", 26)
    small = ImageFont.truetype("arial.ttf", 20)
except Exception:
    font = small = ImageFont.load_default()
# mimic the gold column + level + kda we read from the real Tab scoreboard
rows = [("16","2754","2/7/12"),("15","2531","2/9/2"),("13","1829","8/6/6"),
        ("19","259","2/6/1"),("13","2186","3/7/11")]
y = 12
for lvl, gold, kda in rows:
    d.text((10, y),  lvl,  font=small, fill=(180,210,180))
    d.text((70, y),  gold, font=font,  fill=(255,228,120))   # gold = yellow
    d.text((175, y), kda,  font=small, fill=(220,230,220))
    y += 60
img.save("synth_scoreboard.png")
print("wrote synth_scoreboard.png", img.size)
