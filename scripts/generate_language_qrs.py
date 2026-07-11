from pathlib import Path

import qrcode


ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "output" / "pdf"
LANGUAGES = {
    "english": "en",
    "spanish": "es",
    "arabic": "ar",
    "chinese": "zh",
    "thai": "th",
    "vietnamese": "vi",
}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, code in LANGUAGES.items():
        url = f"https://pocketfriend.io/?l={code}"
        qr = qrcode.QRCode(
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            border=4,
            box_size=7,
        )
        qr.add_data(url)
        qr.make(fit=True)
        image = qr.make_image(fill_color="black", back_color="white").convert("RGB")
        path = OUT / f"pocketfriend_qr_{name}.png"
        image.save(path, dpi=(300, 300), optimize=True)
        print(f"{name}: {url} -> {path}")


if __name__ == "__main__":
    main()
