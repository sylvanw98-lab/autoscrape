"""缓存封面指纹，用于识别跨平台发布的同一张图。"""
import io
import json
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def fingerprint(url):
    from PIL import Image, ImageChops, ImageOps

    if urlsplit(url).scheme not in ("https", "http"):
        return None
    try:
        request = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(request, timeout=8) as response:
            content = response.read(5_000_001)
        if len(content) > 5_000_000:
            return None
        with Image.open(io.BytesIO(content)) as source:
            image = ImageOps.exif_transpose(source).convert("RGB")
        image.thumbnail((384, 384))
        background = Image.new("RGB", image.size, image.getpixel((0, 0)))
        bounds = ImageChops.difference(image, background).convert("L").point(
            lambda value: 255 if value > 20 else 0
        ).getbbox()
        if bounds:
            image = image.crop(bounds)
        gray = ImageOps.autocontrast(image.convert("L").resize((16, 16), Image.Resampling.LANCZOS))
        return gray.tobytes().hex()
    except (OSError, ValueError, Image.DecompressionBombError):
        return None


def fingerprints(posts, cache_path):
    urls = {post["thumbnail_url"] for post in posts if post["media_type"] == "image" and post["thumbnail_url"]}
    cache = json.loads(cache_path.read_text()) if cache_path.exists() else {}
    missing = sorted(urls.difference(cache))
    try:
        import PIL
    except ImportError:
        if missing:
            print("缺少 Pillow，将使用已有的封面指纹")
    else:
        with ThreadPoolExecutor(max_workers=6) as executor:
            for url, value in zip(missing, executor.map(fingerprint, missing)):
                if value:
                    cache[url] = value
        if missing:
            cache_path.write_text(json.dumps(cache), encoding="utf-8")
    return {url: bytes.fromhex(value) for url, value in cache.items() if url in urls}


def image_distance(left, right):
    return sum(abs(a - b) for a, b in zip(left, right)) / len(left)
