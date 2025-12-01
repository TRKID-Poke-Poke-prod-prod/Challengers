"""
Simple PWA Icon Generator
Creates placeholder icons for your PWA manifest
"""

from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path, text="C"):
    """Create a simple icon with text"""
    # Create image with dark background
    img = Image.new('RGB', (size, size), color='#1a1a1a')
    draw = ImageDraw.Draw(img)
    
    # Try to use a nice font, fall back to default if not available
    try:
        # Adjust font size based on icon size
        font_size = int(size * 0.6)
        font = ImageFont.truetype("arial.ttf", font_size)
    except:
        font = ImageFont.load_default()
    
    # Draw text in center
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    
    position = ((size - text_width) // 2, (size - text_height) // 2)
    draw.text(position, text, fill='#ffffff', font=font)
    
    # Add a border
    draw.rectangle([0, 0, size-1, size-1], outline='#4CAF50', width=max(2, size//50))
    
    # Save
    img.save(output_path, 'PNG')
    print(f"Created: {output_path}")

def generate_all_icons(output_dir="static/img"):
    """Generate all required PWA icons"""
    os.makedirs(output_dir, exist_ok=True)
    
    sizes = [72, 96, 128, 144, 152, 192, 384, 512]
    
    for size in sizes:
        output_path = os.path.join(output_dir, f"icon-{size}x{size}.png")
        create_icon(size, output_path, "C")
    
    print("\n✅ All icons generated!")
    print(f"📁 Location: {output_dir}")
    print("\n💡 Tip: Replace these with your own custom icons for a professional look!")

if __name__ == "__main__":
    # Check if PIL is installed
    try:
        from PIL import Image
        generate_all_icons()
    except ImportError:
        print("❌ Pillow not installed!")
        print("Install it with: pip install Pillow")
        print("\nOr use an online tool to create icons:")
        print("- https://www.pwabuilder.com/imageGenerator")
        print("- https://realfavicongenerator.net/")