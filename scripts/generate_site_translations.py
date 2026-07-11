import json
import time
from pathlib import Path

import requests
from bs4 import BeautifulSoup, Comment, Doctype


ROOT = Path(__file__).resolve().parents[1]
PAGES = [ROOT / "index.html", ROOT / "about.html", ROOT / "contact.html"]
OUT = ROOT / "assets" / "js" / "i18n-data.js"
LANGUAGES = {
    "es": "es",
    "ar": "ar",
    "zh": "zh-CN",
    "th": "th",
    "vi": "vi",
}

KEEP = {
    "Pocketfriend",
    "PocketFriend.io",
    "Pocket",
    "friend",
    "WayRest",
    "Turmasaya",
    "Orobrick",
    "CakeUWish",
    "MT",
    "SL",
    "JR",
    "FACEBOOK",
    "INSTAGRAM",
}

OVERRIDES = {
    "es": {
        "Get Free Proposal": "Obtén una propuesta gratuita",
        "Get a Free Proposal": "Obtén una propuesta gratuita",
        "Get Your Free Proposal": "Obtén tu propuesta gratuita",
        "Talk to an Expert": "Habla con un experto",
        "Smart Websites,": "Sitios web inteligentes,",
        "Automation & AI": "automatización e IA",
        "for Small Business.": "para pequeñas empresas.",
    },
    "ar": {
        "Get Free Proposal": "احصل على عرض مجاني",
        "Get a Free Proposal": "احصل على عرض مجاني",
        "Get Your Free Proposal": "احصل على عرضك المجاني",
        "Talk to an Expert": "تحدث إلى خبير",
        "Smart Websites,": "مواقع إلكترونية ذكية،",
        "Automation & AI": "والأتمتة والذكاء الاصطناعي",
        "for Small Business.": "للشركات الصغيرة.",
    },
    "zh": {
        "Get Free Proposal": "获取免费方案",
        "Get a Free Proposal": "获取免费方案",
        "Get Your Free Proposal": "获取您的免费方案",
        "Talk to an Expert": "咨询专家",
        "Smart Websites,": "智能网站、",
        "Automation & AI": "自动化与人工智能",
        "for Small Business.": "助力小型企业。",
    },
    "th": {
        "Get Free Proposal": "รับข้อเสนอฟรี",
        "Get a Free Proposal": "รับข้อเสนอฟรี",
        "Get Your Free Proposal": "รับข้อเสนอฟรีของคุณ",
        "Talk to an Expert": "พูดคุยกับผู้เชี่ยวชาญ",
        "Smart Websites,": "เว็บไซต์อัจฉริยะ",
        "Automation & AI": "ระบบอัตโนมัติและ AI",
        "for Small Business.": "สำหรับธุรกิจขนาดเล็ก",
    },
    "vi": {
        "Get Free Proposal": "Nhận đề xuất miễn phí",
        "Get a Free Proposal": "Nhận đề xuất miễn phí",
        "Get Your Free Proposal": "Nhận đề xuất miễn phí của bạn",
        "Talk to an Expert": "Trao đổi với chuyên gia",
        "Smart Websites,": "Website thông minh,",
        "Automation & AI": "tự động hóa và AI",
        "for Small Business.": "cho doanh nghiệp nhỏ.",
    },
}


def clean(value: str) -> str:
    return " ".join(value.split())


def should_translate(value: str) -> bool:
    if not value or value in KEEP or not any(ch.isalpha() for ch in value):
        return False
    lower = value.lower()
    if "@" in value or lower.startswith(("http://", "https://", "mailto:", "tel:")):
        return False
    if lower.endswith((".com", ".io", ".app", ".vercel.app")) or value.startswith("/"):
        return False
    return True


def collect_strings():
    values = []
    for page in PAGES:
        soup = BeautifulSoup(page.read_text(encoding="utf-8"), "html.parser")
        for tag in soup(["script", "style", "svg"]):
            tag.decompose()
        for node in soup.find_all(string=True):
            if isinstance(node, (Comment, Doctype)):
                continue
            value = clean(str(node))
            if should_translate(value):
                values.append(value)
        for tag in soup.find_all(True):
            for attribute in ("placeholder", "aria-label", "title", "alt"):
                value = clean(tag.get(attribute, ""))
                if should_translate(value):
                    values.append(value)
    return list(dict.fromkeys(values))


def translate_all(strings, target):
    marker = "[[[PFSEP_9A7]]]"
    batches = []
    current = []
    for value in strings:
        candidate = f"\n{marker}\n".join(current + [value])
        if current and len(candidate) > 3500:
            batches.append(current)
            current = [value]
        else:
            current.append(value)
    if current:
        batches.append(current)

    translated = []
    for batch in batches:
        source = f"\n{marker}\n".join(batch)
        for attempt in range(4):
            try:
                response = requests.get(
                    "https://translate.googleapis.com/translate_a/single",
                    params={"client": "gtx", "sl": "en", "tl": target, "dt": "t", "q": source},
                    timeout=30,
                )
                response.raise_for_status()
                joined = "".join(part[0] for part in response.json()[0])
                result = [part.strip() for part in joined.split(marker)]
                if len(result) != len(batch):
                    raise RuntimeError("Translation batch length mismatch")
                translated.extend(result)
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(2 * (attempt + 1))
        time.sleep(0.2)
    return translated


def write_data(data):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(f"window.PF_I18N={payload};\n", encoding="utf-8")


def main():
    strings = collect_strings()
    data = {"en": {value: value for value in strings}}
    print(f"Collected {len(strings)} translatable strings", flush=True)
    for language, target in LANGUAGES.items():
        print(f"Translating {language}...", flush=True)
        translated = translate_all(strings, target)
        mapping = dict(zip(strings, translated))
        mapping.update(OVERRIDES.get(language, {}))
        data[language] = mapping
        write_data(data)
        print(f"Completed {language}", flush=True)

    write_data(data)
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
