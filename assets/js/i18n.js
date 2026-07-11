(() => {
    const supported = ["en", "es", "ar", "zh", "th", "vi"];
    const names = {
        en: "English",
        es: "Español",
        ar: "العربية",
        zh: "中文",
        th: "ไทย",
        vi: "Tiếng Việt",
    };

    const params = new URLSearchParams(window.location.search);
    const queryLanguage = params.get("l");
    const storedLanguage = localStorage.getItem("pf_language");
    const browserLanguage = (navigator.language || "en").toLowerCase().split("-")[0];
    const language = supported.includes(queryLanguage)
        ? queryLanguage
        : supported.includes(storedLanguage)
            ? storedLanguage
            : supported.includes(browserLanguage)
                ? browserLanguage
                : "en";

    localStorage.setItem("pf_language", language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";

    const normalize = (value) => value.trim().replace(/\s+/g, " ");

    function translateText(root) {
        if (language === "en" || !window.PF_I18N?.[language]) return;
        const dictionary = window.PF_I18N[language];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);
        nodes.forEach((node) => {
            const parent = node.parentElement;
            if (!parent || ["SCRIPT", "STYLE", "SVG", "NOSCRIPT"].includes(parent.tagName)) return;
            const source = normalize(node.nodeValue || "");
            const translated = dictionary[source];
            if (!source || !translated) return;
            const leading = (node.nodeValue.match(/^\s*/) || [""])[0];
            const trailing = (node.nodeValue.match(/\s*$/) || [""])[0];
            node.nodeValue = `${leading}${translated}${trailing}`;
        });

        document.querySelectorAll("[placeholder], [aria-label], [title], [alt]").forEach((element) => {
            ["placeholder", "aria-label", "title", "alt"].forEach((attribute) => {
                if (!element.hasAttribute(attribute)) return;
                const source = normalize(element.getAttribute(attribute) || "");
                if (dictionary[source]) element.setAttribute(attribute, dictionary[source]);
            });
        });
    }

    function preserveLanguageInLinks() {
        document.querySelectorAll("a[href]").forEach((link) => {
            const href = link.getAttribute("href");
            if (!href || /^(mailto:|tel:|https?:\/\/wa\.me|javascript:)/i.test(href)) return;
            try {
                const url = new URL(href, window.location.href);
                if (url.origin !== window.location.origin) return;
                url.searchParams.set("l", language);
                link.href = `${url.pathname}${url.search}${url.hash}`;
            } catch (_) {
                // Leave malformed or non-navigation links untouched.
            }
        });
    }

    function addLanguageSelector() {
        const wrapper = document.createElement("div");
        wrapper.className = "pf-language-switcher";
        const select = document.createElement("select");
        select.setAttribute("aria-label", "Choose website language");
        supported.forEach((code) => {
            const option = document.createElement("option");
            option.value = code;
            option.textContent = names[code];
            option.selected = code === language;
            select.appendChild(option);
        });
        select.addEventListener("change", () => {
            const next = select.value;
            localStorage.setItem("pf_language", next);
            const url = new URL(window.location.href);
            url.searchParams.set("l", next);
            window.location.href = url.toString();
        });
        wrapper.appendChild(select);
        document.body.appendChild(wrapper);
    }

    function addStyles() {
        const style = document.createElement("style");
        style.textContent = `
            .pf-language-switcher {
                position: fixed;
                top: 82px;
                right: 18px;
                z-index: 10000;
                border: 1px solid rgba(255,255,255,.16);
                border-radius: 999px;
                padding: 3px;
                background: rgba(5,5,5,.82);
                box-shadow: 0 10px 30px rgba(0,0,0,.24);
                backdrop-filter: blur(14px);
            }
            .pf-language-switcher select {
                min-width: 116px;
                border: 0;
                outline: 0;
                border-radius: 999px;
                padding: 8px 12px;
                color: #fff;
                background: #141414;
                font: 600 13px/1.2 'Satoshi', Arial, sans-serif;
                cursor: pointer;
            }
            html[dir="rtl"] body { direction: rtl; }
            html[dir="rtl"] .text-left { text-align: right !important; }
            html[dir="rtl"] input,
            html[dir="rtl"] textarea,
            html[dir="rtl"] select { direction: rtl; text-align: right; }
            @media (max-width: 640px) {
                .pf-language-switcher { top: 72px; right: 10px; }
                .pf-language-switcher select { min-width: 102px; padding: 7px 10px; }
            }
        `;
        document.head.appendChild(style);
    }

    document.addEventListener("DOMContentLoaded", () => {
        addStyles();
        translateText(document.body);
        preserveLanguageInLinks();
        addLanguageSelector();
    });
})();
