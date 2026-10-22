from PIL import Image, ImageDraw
import numpy as np

def generate_schnell_logo_refined(size=512, filename="schnell-logo.png"):
    scale = 4
    dim = size * scale
    
    img = Image.new("RGBA", (dim, dim), (255, 255, 255, 0))
    draw = ImageDraw.Draw(img)

    # Corporate Schnell Blue: #268ecd
    color = (38, 142, 205, 255)

    cx, cy = dim / 2, dim / 2
    
    # Radii configuration
    band_w = dim * 0.050
    gap = dim * 0.034
    step = band_w + gap

    r_inner = dim * 0.125
    r_mid = r_inner + step
    r_outer = r_mid + step

    radii = [r_outer, r_mid, r_inner]
    
    # Centers for top and bottom loops
    offset_y = dim * 0.13
    top_cy = cy - offset_y
    bot_cy = cy + offset_y

    # Draw Top Arcs:
    # They start from ~85 degrees (near center vertical) and sweep counter-clockwise / clockwise
    # In PIL: 0 is right (3 o'clock), 90 is bottom (6 o'clock), 180 is left (9 o'clock), 270 is top (12 o'clock)
    # The top arcs start from vertical right (270 deg) and sweep around left (180) to bottom (90)
    for r in radii:
        bbox = [cx - r, top_cy - r, cx + r, top_cy + r]
        # From bottom-center (85 deg) sweeping up around left to top-right (270 deg)
        draw.arc(bbox, start=88, end=270, fill=color, width=int(band_w))

    # Draw Bottom Arcs:
    # 180 degree rotation of top arcs
    # They start from top-center (268 deg) and sweep around right (0) to bottom-left (90 deg)
    for r in radii:
        bbox = [cx - r, bot_cy - r, cx + r, bot_cy + r]
        draw.arc(bbox, start=268, end=90, fill=color, width=int(band_w))

    # Center smooth S-spine connection
    # The inner top arc ends at (cx, top_cy + r_inner) = (cx, cy - offset_y + r_inner)
    # The inner bottom arc ends at (cx, bot_cy - r_inner) = (cx, cy + offset_y - r_inner)
    # Connect them with a smooth diagonal stroke
    p1 = (cx - band_w * 0.25, top_cy + r_inner * 0.85)
    p2 = (cx + band_w * 0.25, bot_cy - r_inner * 0.85)
    draw.line([p1, p2], fill=color, width=int(band_w))

    # Resize with high quality Lanczos filter
    img_resized = img.resize((size, size), Image.Resampling.LANCZOS)
    img_resized.save(filename, "PNG")
    print(f"Saved refined logo to {filename}")

if __name__ == "__main__":
    generate_schnell_logo_refined(512, r"D:\SCHNELL\Dashboard\frontend\public\schnell-logo.png")
