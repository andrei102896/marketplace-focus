document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("settings-form");
    const tabTriggers = Array.from(form.querySelectorAll("[data-tab-trigger]"));
    const tabPanels = Array.from(form.querySelectorAll("[data-tab-panel]"));
    const pauseInput = document.getElementById("default-pause-minutes");
    const exceptionsInput = document.getElementById("exceptions-input");
    const confirmBeforeDisableInput = document.getElementById("confirm-before-disable");
    const confirmBeforePauseInput = document.getElementById("confirm-before-pause");
    const hardLockEnabledInput = document.getElementById("hard-lock-enabled");
    const hardLockCooldownInput = document.getElementById("hard-lock-cooldown-minutes");
    const scheduleEnabledInput = document.getElementById("schedule-enabled");
    const scheduleStartTimeInput = document.getElementById("schedule-start-time");
    const scheduleEndTimeInput = document.getElementById("schedule-end-time");
    const scheduleDayInputs = Array.from(form.querySelectorAll('input[name="schedule-day"]'));
    const hardLockConfigBlock = form.querySelector("[data-hard-lock-config]");
    const scheduleConfigBlock = form.querySelector("[data-schedule-config]");
    const statusMessage = document.getElementById("status-message");

    const DEFAULT_BLOCK_MODE = "strict";
    const DEFAULT_PAUSE_MINUTES = 30;
    const DEFAULT_HARD_LOCK_COOLDOWN_MINUTES = 10;
    const DEFAULT_SCHEDULE_START_TIME = "09:00";
    const DEFAULT_SCHEDULE_END_TIME = "17:00";
    const DEFAULT_SCHEDULE_DAYS = [1, 2, 3, 4, 5];
    const TAB_FALLBACK = "blocking";
    const tabTriggerMap = new Map(
        tabTriggers
            .map((trigger) => [trigger.dataset.tabTrigger, trigger])
            .filter(([tabId]) => typeof tabId === "string" && tabId.length > 0)
    );
    const tabPanelMap = new Map(
        tabPanels
            .map((panel) => [panel.dataset.tabPanel, panel])
            .filter(([tabId]) => typeof tabId === "string" && tabId.length > 0)
    );
    let activeTabId = TAB_FALLBACK;

    const t = (key, substitutions = [], fallback = "") => {
        const localized = chrome.i18n.getMessage(key, substitutions);
        return localized || fallback;
    };

    const applyStaticI18n = () => {
        const textNodes = document.querySelectorAll("[data-i18n]");
        textNodes.forEach((node) => {
            const key = node.getAttribute("data-i18n");
            if (!key) {
                return;
            }

            const text = t(key);
            if (text) {
                node.textContent = text;
            }
        });

        const placeholderNodes = document.querySelectorAll("[data-i18n-placeholder]");
        placeholderNodes.forEach((node) => {
            const key = node.getAttribute("data-i18n-placeholder");
            if (!key) {
                return;
            }

            const text = t(key);
            if (text) {
                node.setAttribute("placeholder", text);
            }
        });

        const ariaLabelNodes = document.querySelectorAll("[data-i18n-aria-label]");
        ariaLabelNodes.forEach((node) => {
            const key = node.getAttribute("data-i18n-aria-label");
            if (!key) {
                return;
            }

            const text = t(key);
            if (text) {
                node.setAttribute("aria-label", text);
            }
        });

        const localizedTitle = t("optionsPageTitle");
        if (localizedTitle) {
            document.title = localizedTitle;
        }
    };

    const normalizeBoolean = (value, fallback = false) => {
        return typeof value === "boolean" ? value : fallback;
    };

    const normalizeBlockMode = (value) => {
        return value === "hide_only" ? "hide_only" : DEFAULT_BLOCK_MODE;
    };

    const normalizePauseMinutes = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return DEFAULT_PAUSE_MINUTES;
        }

        const rounded = Math.round(parsed);
        if (rounded < 5 || rounded > 180) {
            return DEFAULT_PAUSE_MINUTES;
        }

        return rounded;
    };

    const normalizeHardLockCooldownMinutes = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return DEFAULT_HARD_LOCK_COOLDOWN_MINUTES;
        }

        const rounded = Math.round(parsed);
        if (rounded < 0 || rounded > 180) {
            return DEFAULT_HARD_LOCK_COOLDOWN_MINUTES;
        }

        return rounded;
    };

    const normalizeScheduleTime = (value, fallback) => {
        if (typeof value !== "string") {
            return fallback;
        }

        const trimmed = value.trim();
        const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
        if (!match) {
            return fallback;
        }

        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
            return fallback;
        }

        if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
            return fallback;
        }

        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    };

    const normalizeScheduleDays = (value) => {
        if (!Array.isArray(value)) {
            return [...DEFAULT_SCHEDULE_DAYS];
        }

        const uniqueDays = new Set();
        value.forEach((entry) => {
            const day = Number(entry);
            if (Number.isInteger(day) && day >= 0 && day <= 6) {
                uniqueDays.add(day);
            }
        });

        const normalized = Array.from(uniqueDays).sort((first, second) => first - second);
        if (normalized.length === 0) {
            return [...DEFAULT_SCHEDULE_DAYS];
        }

        return normalized;
    };

    const normalizeExceptions = (value) => {
        const sourceLines = Array.isArray(value)
            ? value
            : String(value || "").split(/\r?\n/);

        const uniqueRules = new Set();
        sourceLines.forEach((entry) => {
            const rule = String(entry || "").trim();
            if (rule) {
                uniqueRules.add(rule);
            }
        });

        return Array.from(uniqueRules);
    };

    const setStatus = (message, type = "") => {
        statusMessage.textContent = message;
        statusMessage.className = type;
    };

    const getSelectedBlockMode = () => {
        const selected = form.querySelector('input[name="block-mode"]:checked');
        return normalizeBlockMode(selected ? selected.value : DEFAULT_BLOCK_MODE);
    };

    const getSelectedScheduleDays = () => {
        return scheduleDayInputs
            .filter((input) => input.checked)
            .map((input) => Number(input.value))
            .filter((value) => Number.isInteger(value) && value >= 0 && value <= 6)
            .sort((first, second) => first - second);
    };

    const activateTab = (nextTabId, { focus = false, updateHash = false } = {}) => {
        if (!tabTriggerMap.has(nextTabId) || !tabPanelMap.has(nextTabId)) {
            return;
        }

        activeTabId = nextTabId;

        tabTriggers.forEach((trigger) => {
            const tabId = trigger.dataset.tabTrigger;
            const isActive = tabId === nextTabId;
            trigger.classList.toggle("is-active", isActive);
            trigger.setAttribute("aria-selected", String(isActive));
            trigger.tabIndex = isActive ? 0 : -1;
            if (isActive && focus) {
                trigger.focus();
            }
        });

        tabPanels.forEach((panel) => {
            const tabId = panel.dataset.tabPanel;
            panel.hidden = tabId !== nextTabId;
        });

        if (updateHash && window.location.hash !== `#${nextTabId}`) {
            window.history.replaceState(null, "", `#${nextTabId}`);
        }
    };

    const getHashTabId = () => {
        const hashValue = window.location.hash.replace(/^#/, "").trim();
        if (tabTriggerMap.has(hashValue) && tabPanelMap.has(hashValue)) {
            return hashValue;
        }

        return "";
    };

    const initializeTabs = () => {
        if (tabTriggers.length === 0 || tabPanels.length === 0) {
            return;
        }

        tabTriggers.forEach((trigger) => {
            trigger.tabIndex = -1;
            trigger.addEventListener("click", () => {
                const tabId = trigger.dataset.tabTrigger || TAB_FALLBACK;
                activateTab(tabId, { updateHash: true });
            });

            trigger.addEventListener("keydown", (event) => {
                const currentIndex = tabTriggers.indexOf(trigger);
                if (currentIndex < 0) {
                    return;
                }

                let targetIndex = -1;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") {
                    targetIndex = (currentIndex + 1) % tabTriggers.length;
                } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
                    targetIndex = (currentIndex - 1 + tabTriggers.length) % tabTriggers.length;
                } else if (event.key === "Home") {
                    targetIndex = 0;
                } else if (event.key === "End") {
                    targetIndex = tabTriggers.length - 1;
                } else {
                    return;
                }

                event.preventDefault();
                const targetId = tabTriggers[targetIndex].dataset.tabTrigger || TAB_FALLBACK;
                activateTab(targetId, { focus: true, updateHash: true });
            });
        });

        const defaultTab = tabTriggers[0]?.dataset.tabTrigger || TAB_FALLBACK;
        const hashTab = getHashTabId();
        activateTab(hashTab || defaultTab);

        window.addEventListener("hashchange", () => {
            const hashTabId = getHashTabId();
            if (hashTabId && hashTabId !== activeTabId) {
                activateTab(hashTabId);
            }
        });
    };

    const switchToTab = (tabId) => {
        if (!tabTriggerMap.has(tabId) || !tabPanelMap.has(tabId)) {
            return;
        }

        activateTab(tabId, { focus: true, updateHash: true });
    };

    const applyInterlocks = () => {
        const hardLockEnabled = hardLockEnabledInput.checked;
        hardLockCooldownInput.disabled = !hardLockEnabled;
        if (hardLockConfigBlock) {
            hardLockConfigBlock.hidden = !hardLockEnabled;
        }

        const scheduleEnabled = scheduleEnabledInput.checked;
        scheduleStartTimeInput.disabled = !scheduleEnabled;
        scheduleEndTimeInput.disabled = !scheduleEnabled;
        scheduleDayInputs.forEach((input) => {
            input.disabled = !scheduleEnabled;
        });
        if (scheduleConfigBlock) {
            scheduleConfigBlock.hidden = !scheduleEnabled;
        }
    };

    const applySettings = (settings) => {
        const blockMode = normalizeBlockMode(settings.blockMode);
        const defaultPauseMinutes = normalizePauseMinutes(settings.defaultPauseMinutes);
        const reelsExceptions = normalizeExceptions(settings.reelsExceptions);
        const confirmBeforeDisable = normalizeBoolean(settings.confirmBeforeDisable);
        const confirmBeforePause = normalizeBoolean(settings.confirmBeforePause);
        const hardLockEnabled = settings.hardLockEnabled === true;
        const hardLockCooldownMinutes = normalizeHardLockCooldownMinutes(settings.hardLockCooldownMinutes);
        const scheduleEnabled = settings.scheduleEnabled === true;
        const scheduleStartTime = normalizeScheduleTime(settings.scheduleStartTime, DEFAULT_SCHEDULE_START_TIME);
        const scheduleEndTime = normalizeScheduleTime(settings.scheduleEndTime, DEFAULT_SCHEDULE_END_TIME);
        const scheduleDays = normalizeScheduleDays(settings.scheduleDays);

        const radio = form.querySelector(`input[name="block-mode"][value="${blockMode}"]`);
        if (radio) {
            radio.checked = true;
        }

        pauseInput.value = String(defaultPauseMinutes);
        exceptionsInput.value = reelsExceptions.join("\n");
        confirmBeforeDisableInput.checked = confirmBeforeDisable;
        confirmBeforePauseInput.checked = confirmBeforePause;

        hardLockEnabledInput.checked = hardLockEnabled;
        hardLockCooldownInput.value = String(hardLockCooldownMinutes);

        scheduleEnabledInput.checked = scheduleEnabled;
        scheduleStartTimeInput.value = scheduleStartTime;
        scheduleEndTimeInput.value = scheduleEndTime;

        scheduleDayInputs.forEach((input) => {
            input.checked = scheduleDays.includes(Number(input.value));
        });

        applyInterlocks();
    };

    applyStaticI18n();
    initializeTabs();

    chrome.storage.local.get(
        [
            "blockMode",
            "defaultPauseMinutes",
            "reelsExceptions",
            "confirmBeforeDisable",
            "confirmBeforePause",
            "hardLockEnabled",
            "hardLockCooldownMinutes",
            "scheduleEnabled",
            "scheduleStartTime",
            "scheduleEndTime",
            "scheduleDays"
        ],
        (result) => {
            applySettings(result);
        }
    );

    hardLockEnabledInput.addEventListener("change", applyInterlocks);
    scheduleEnabledInput.addEventListener("change", applyInterlocks);

    form.addEventListener("submit", (event) => {
        event.preventDefault();

        const scheduleEnabled = scheduleEnabledInput.checked;
        const selectedScheduleDays = getSelectedScheduleDays();
        if (scheduleEnabled && selectedScheduleDays.length === 0) {
            switchToTab("schedule");
            setStatus(t("optionsErrorSelectScheduleDay", [], "Select at least one day for schedule."), "error");
            return;
        }

        const nextSettings = {
            blockMode: getSelectedBlockMode(),
            defaultPauseMinutes: normalizePauseMinutes(pauseInput.value),
            reelsExceptions: normalizeExceptions(exceptionsInput.value),
            confirmBeforeDisable: confirmBeforeDisableInput.checked,
            confirmBeforePause: confirmBeforePauseInput.checked,
            hardLockEnabled: hardLockEnabledInput.checked,
            hardLockCooldownMinutes: normalizeHardLockCooldownMinutes(hardLockCooldownInput.value),
            scheduleEnabled,
            scheduleStartTime: normalizeScheduleTime(scheduleStartTimeInput.value, DEFAULT_SCHEDULE_START_TIME),
            scheduleEndTime: normalizeScheduleTime(scheduleEndTimeInput.value, DEFAULT_SCHEDULE_END_TIME),
            scheduleDays: scheduleEnabled
                ? selectedScheduleDays
                : normalizeScheduleDays(selectedScheduleDays)
        };

        pauseInput.value = String(nextSettings.defaultPauseMinutes);
        exceptionsInput.value = nextSettings.reelsExceptions.join("\n");
        hardLockCooldownInput.value = String(nextSettings.hardLockCooldownMinutes);
        scheduleStartTimeInput.value = nextSettings.scheduleStartTime;
        scheduleEndTimeInput.value = nextSettings.scheduleEndTime;

        chrome.storage.local.set(nextSettings, () => {
            if (chrome.runtime.lastError) {
                setStatus(t("optionsSaveError", [], "Could not save settings."), "error");
                return;
            }

            setStatus(t("optionsSaveSuccess", [], "Settings saved."), "success");
            window.setTimeout(() => {
                setStatus("");
            }, 1800);
        });
    });
});
