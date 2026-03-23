const HOME_URL = "https://www.facebook.com/";
const REELS_PATH_REGEX = /^\/reels?(?:\/|$)/i;
const REELS_TEXT_REGEX = /\breels?\b/i;
const REELS_HEADING_TEXT_REGEX = /\breels?\b|short videos?/i;
const REELS_ENTRY_SELECTORS = [
    'a[href*="/reels"]',
    'a[href*="/reel/"]',
    'a[aria-label*="reel" i]',
    '[role="link"][aria-label*="reel" i]',
    '[role="button"][aria-label*="reel" i]'
];
const REELS_CONTAINER_HINT_SELECTORS = [
    '[data-pagelet*="reel" i]',
    '[aria-label*="reel" i][role="region"]',
    '[aria-label*="reel" i][role="article"]'
];
const REELS_HEADING_SELECTOR = '[role="heading"], h1, h2, h3, h4';
const MODULE_CONTAINER_SELECTOR = '[role="article"], [data-pagelet], section, [role="region"]';
const NAV_SELECTOR = 'nav, [role="navigation"]';
const CLICKABLE_SELECTOR = 'a, [role="link"], [role="button"]';
const MAX_HEADING_SCAN_PER_PASS = 180;
const BLOCK_MODE_STRICT = "strict";
const BLOCK_MODE_HIDE_ONLY = "hide_only";

let observer = null;
let effectiveEnabled = true;
let started = false;
let updateScheduled = false;
let pauseUntil = null;
let blockMode = BLOCK_MODE_STRICT;
let reelsExceptions = [];
let routeWatcherIntervalId = null;
let lastKnownPathname = window.location.pathname;
const hiddenElements = new Map();

const normalizePauseUntil = (value) => {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > Date.now() ? timestamp : null;
};

const normalizeBlockMode = (value) => {
    return value === BLOCK_MODE_HIDE_ONLY ? BLOCK_MODE_HIDE_ONLY : BLOCK_MODE_STRICT;
};

const normalizeEffectiveEnabled = (value, fallback = true) => {
    if (typeof value === "boolean") {
        return value;
    }

    return fallback;
};

const normalizeExceptions = (value) => {
    if (!Array.isArray(value)) {
        return [];
    }

    const unique = new Set();
    value.forEach((entry) => {
        const rule = String(entry || "").trim();
        if (rule) {
            unique.add(rule);
        }
    });

    return Array.from(unique);
};

const normalizeText = (value) => {
    return String(value || "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();
};

const hasReelsLabel = (value) => REELS_TEXT_REGEX.test(normalizeText(value));
const hasReelsHeadingText = (value) => REELS_HEADING_TEXT_REGEX.test(normalizeText(value));

const isPauseActive = () => pauseUntil !== null && pauseUntil > Date.now();
const isLockdownActive = () => effectiveEnabled && !isPauseActive();
const isStrictMode = () => blockMode === BLOCK_MODE_STRICT;
const isReelsPath = (pathname) => REELS_PATH_REGEX.test((pathname || "").toLowerCase());

const doesHostMatch = (currentHost, ruleHost) => {
    return currentHost === ruleHost || currentHost.endsWith(`.${ruleHost}`);
};

const matchesExceptionRule = (rule, currentUrl) => {
    const normalizedRule = String(rule || "").trim().toLowerCase();
    if (!normalizedRule) {
        return false;
    }

    const currentHost = currentUrl.hostname.toLowerCase();
    const currentPath = currentUrl.pathname.toLowerCase();
    const currentHref = currentUrl.href.toLowerCase();

    if (normalizedRule.includes("://")) {
        try {
            const parsedRule = new URL(normalizedRule);
            return currentHref.startsWith(parsedRule.href.toLowerCase());
        } catch {
            return false;
        }
    }

    if (normalizedRule.startsWith("/")) {
        return currentPath.startsWith(normalizedRule);
    }

    if (normalizedRule.includes("/") && normalizedRule.includes(".")) {
        const slashIndex = normalizedRule.indexOf("/");
        const hostRule = normalizedRule.slice(0, slashIndex);
        const pathRule = normalizedRule.slice(slashIndex);
        return doesHostMatch(currentHost, hostRule) && currentPath.startsWith(pathRule);
    }

    if (normalizedRule.includes(".")) {
        return doesHostMatch(currentHost, normalizedRule);
    }

    const profilePathRule = `/${normalizedRule.replace(/^\/+/, "")}`;
    return currentPath.startsWith(profilePathRule);
};

const isExceptionActiveForCurrentPage = () => {
    if (reelsExceptions.length === 0) {
        return false;
    }

    const currentUrl = new URL(window.location.href);
    return reelsExceptions.some((rule) => matchesExceptionRule(rule, currentUrl));
};

const getElementHref = (element) => {
    if (!element) {
        return "";
    }

    return element.getAttribute("href") || element.getAttribute("data-href") || element.getAttribute("data-url") || "";
};

const isReelsHref = (href) => {
    if (!href) {
        return false;
    }

    try {
        const url = new URL(href, window.location.origin);
        return isReelsPath(url.pathname);
    } catch {
        return false;
    }
};

const isReelsNavigationElement = (element) => {
    if (!element) {
        return false;
    }

    if (isReelsHref(getElementHref(element))) {
        return true;
    }

    if (hasReelsLabel(element.getAttribute("aria-label")) || hasReelsLabel(element.getAttribute("title"))) {
        return true;
    }

    const role = element.getAttribute("role");
    if (element.tagName === "A" || role === "link" || role === "button") {
        return hasReelsLabel(element.textContent);
    }

    return false;
};

const pruneHiddenElements = () => {
    hiddenElements.forEach((_, element) => {
        if (!element || !element.isConnected) {
            hiddenElements.delete(element);
        }
    });
};

const hideElement = (element) => {
    if (!element || hiddenElements.has(element)) {
        return;
    }

    hiddenElements.set(element, {
        value: element.style.getPropertyValue("display"),
        priority: element.style.getPropertyPriority("display")
    });
    element.style.setProperty("display", "none", "important");
};

const restoreHiddenElements = () => {
    hiddenElements.forEach((previousDisplay, element) => {
        if (!element || !element.isConnected) {
            return;
        }

        if (previousDisplay.value) {
            element.style.setProperty("display", previousDisplay.value, previousDisplay.priority);
        } else {
            element.style.removeProperty("display");
        }
    });

    hiddenElements.clear();
};

const isRootOrCriticalContainer = (element) => {
    if (!element || element === document.body || element === document.documentElement) {
        return true;
    }

    const role = element.getAttribute("role");
    if (role === "main" || role === "feed" || role === "navigation") {
        return true;
    }

    const id = element.id || "";
    if (id === "mount_0_0" || id.startsWith("mount_")) {
        return true;
    }

    return false;
};

const isContainerReasonableSize = (element) => {
    if (!(element instanceof HTMLElement)) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        return false;
    }

    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const elementArea = rect.width * rect.height;

    return elementArea < viewportArea * 0.85;
};

const isSafeReelsContainer = (container) => {
    if (!container || !(container instanceof HTMLElement)) {
        return false;
    }

    if (isRootOrCriticalContainer(container)) {
        return false;
    }

    if (container.closest(NAV_SELECTOR)) {
        return false;
    }

    return isContainerReasonableSize(container);
};

const containerLooksLikeReelsSurface = (container) => {
    if (!container) {
        return false;
    }

    if (container.matches('[data-pagelet*="reel" i]')) {
        return true;
    }

    if (hasReelsLabel(container.getAttribute("aria-label")) || hasReelsLabel(container.getAttribute("title"))) {
        return true;
    }

    if (container.querySelector('a[href*="/reels"], a[href*="/reel/"]')) {
        return true;
    }

    const headings = container.querySelectorAll(REELS_HEADING_SELECTOR);
    for (let index = 0; index < headings.length; index += 1) {
        if (hasReelsHeadingText(headings[index].textContent)) {
            return true;
        }
    }

    return false;
};

const findReelsModuleContainer = (startElement) => {
    let current = startElement;
    let depth = 0;

    while (current && current !== document.body && depth < 10) {
        if (current instanceof HTMLElement && current.matches(MODULE_CONTAINER_SELECTOR) && isSafeReelsContainer(current) && containerLooksLikeReelsSurface(current)) {
            return current;
        }

        current = current.parentElement;
        depth += 1;
    }

    return null;
};

const redirectIfOnReels = () => {
    if (isReelsPath(window.location.pathname)) {
        window.location.replace(HOME_URL);
    }
};

const collectReelsEntryElements = () => {
    const entryElements = new Set();

    REELS_ENTRY_SELECTORS.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
            if (!(node instanceof Element)) {
                return;
            }

            const actionElement = node.closest(CLICKABLE_SELECTOR) || node;
            if (actionElement instanceof Element && isReelsNavigationElement(actionElement)) {
                entryElements.add(actionElement);
            }
        });
    });

    return entryElements;
};

const hideReelsEntryPoints = () => {
    const entryElements = collectReelsEntryElements();

    entryElements.forEach((entryElement) => {
        hideElement(entryElement);

        const navItem = entryElement.closest('li, [role="listitem"]');
        if (navItem && navItem.closest(NAV_SELECTOR)) {
            hideElement(navItem);
        }

        const moduleContainer = findReelsModuleContainer(entryElement);
        if (moduleContainer) {
            hideElement(moduleContainer);
        }
    });
};

const hideReelsHintedContainers = () => {
    const containers = new Set();

    REELS_CONTAINER_HINT_SELECTORS.forEach((selector) => {
        document.querySelectorAll(selector).forEach((node) => {
            if (node instanceof HTMLElement) {
                containers.add(node);
            }
        });
    });

    const headings = document.querySelectorAll(REELS_HEADING_SELECTOR);
    for (let index = 0; index < headings.length && index < MAX_HEADING_SCAN_PER_PASS; index += 1) {
        const headingNode = headings[index];
        if (!(headingNode instanceof HTMLElement)) {
            continue;
        }

        if (headingNode.closest(NAV_SELECTOR)) {
            continue;
        }

        if (!hasReelsHeadingText(headingNode.textContent)) {
            continue;
        }

        const hintedContainer = headingNode.closest(MODULE_CONTAINER_SELECTOR);
        if (hintedContainer instanceof HTMLElement) {
            containers.add(hintedContainer);
        }
    }

    containers.forEach((container) => {
        if (isSafeReelsContainer(container) && containerLooksLikeReelsSurface(container)) {
            hideElement(container);
        }
    });
};

const enforceLockdown = () => {
    if (!isLockdownActive()) {
        return;
    }

    if (isExceptionActiveForCurrentPage()) {
        restoreHiddenElements();
        return;
    }

    pruneHiddenElements();
    hideReelsEntryPoints();
    hideReelsHintedContainers();

    if (isStrictMode()) {
        redirectIfOnReels();
    }
};

const scheduleEnforceLockdown = () => {
    if (!isLockdownActive() || updateScheduled) {
        return;
    }

    updateScheduled = true;
    requestAnimationFrame(() => {
        updateScheduled = false;
        enforceLockdown();
    });
};

const handleDocumentClick = (event) => {
    if (!isLockdownActive() || !isStrictMode()) {
        return;
    }

    if (isExceptionActiveForCurrentPage()) {
        return;
    }

    const target = event.target;
    if (!(target instanceof Element)) {
        return;
    }

    const actionElement = target.closest(CLICKABLE_SELECTOR);
    if (!actionElement) {
        return;
    }

    if (isReelsNavigationElement(actionElement)) {
        event.preventDefault();
        event.stopPropagation();
        window.location.replace(HOME_URL);
    }
};

const startRouteWatcher = () => {
    if (routeWatcherIntervalId !== null) {
        return;
    }

    lastKnownPathname = window.location.pathname;
    routeWatcherIntervalId = window.setInterval(() => {
        const currentPathname = window.location.pathname;
        if (currentPathname !== lastKnownPathname) {
            lastKnownPathname = currentPathname;
            scheduleEnforceLockdown();
        }
    }, 500);
};

const stopRouteWatcher = () => {
    if (routeWatcherIntervalId === null) {
        return;
    }

    window.clearInterval(routeWatcherIntervalId);
    routeWatcherIntervalId = null;
};

const startLockdown = () => {
    if (started) {
        scheduleEnforceLockdown();
        return;
    }

    started = true;
    const rootNode = document.documentElement || document;

    observer = new MutationObserver(scheduleEnforceLockdown);
    observer.observe(rootNode, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href", "aria-label", "title", "data-pagelet"]
    });

    window.addEventListener("popstate", scheduleEnforceLockdown, true);
    window.addEventListener("hashchange", scheduleEnforceLockdown, true);
    document.addEventListener("click", handleDocumentClick, true);
    startRouteWatcher();

    scheduleEnforceLockdown();
};

const stopLockdown = () => {
    if (!started) {
        return;
    }

    started = false;

    if (observer) {
        observer.disconnect();
        observer = null;
    }

    window.removeEventListener("popstate", scheduleEnforceLockdown, true);
    window.removeEventListener("hashchange", scheduleEnforceLockdown, true);
    document.removeEventListener("click", handleDocumentClick, true);
    stopRouteWatcher();
    restoreHiddenElements();
};

const syncLockdownState = () => {
    if (isLockdownActive()) {
        startLockdown();
    } else {
        stopLockdown();
    }
};

chrome.storage.local.get(["effectiveEnabled", "enabled", "pauseUntil", "blockMode", "reelsExceptions"], (result) => {
    effectiveEnabled = normalizeEffectiveEnabled(result.effectiveEnabled, result.enabled !== false);
    pauseUntil = normalizePauseUntil(result.pauseUntil);
    blockMode = normalizeBlockMode(result.blockMode);
    reelsExceptions = normalizeExceptions(result.reelsExceptions);

    if (result.pauseUntil && pauseUntil === null) {
        chrome.storage.local.set({ pauseUntil: null });
    }

    if (result.blockMode !== blockMode) {
        chrome.storage.local.set({ blockMode });
    }

    syncLockdownState();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
        return;
    }

    if (changes.effectiveEnabled) {
        effectiveEnabled = normalizeEffectiveEnabled(changes.effectiveEnabled.newValue, effectiveEnabled);
    } else if (changes.enabled) {
        effectiveEnabled = normalizeEffectiveEnabled(changes.enabled.newValue, effectiveEnabled);
    }

    if (changes.pauseUntil) {
        pauseUntil = normalizePauseUntil(changes.pauseUntil.newValue);
    }

    if (changes.blockMode) {
        blockMode = normalizeBlockMode(changes.blockMode.newValue);
    }

    if (changes.reelsExceptions) {
        reelsExceptions = normalizeExceptions(changes.reelsExceptions.newValue);
    }

    syncLockdownState();
});
