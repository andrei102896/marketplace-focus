const PAUSE_ALARM_NAME = "pause-resume";
const HARD_LOCK_DISABLE_ALARM_NAME = "hard-lock-disable";
const SCHEDULE_TICK_ALARM_NAME = "schedule-tick";

const DEFAULT_SETTINGS = Object.freeze({
    enabled: true,
    effectiveEnabled: true,
    blockMode: "strict",
    defaultPauseMinutes: 30,
    pauseUntil: null,
    reelsExceptions: [],
    confirmBeforeDisable: false,
    confirmBeforePause: false,
    hardLockEnabled: false,
    hardLockCooldownMinutes: 10,
    hardLockPendingDisableUntil: null,
    scheduleEnabled: false,
    scheduleStartTime: "09:00",
    scheduleEndTime: "17:00",
    scheduleDays: [1, 2, 3, 4, 5]
});

const STORAGE_KEYS = Object.freeze([
    "enabled",
    "effectiveEnabled",
    "pauseUntil",
    "blockMode",
    "defaultPauseMinutes",
    "hardLockEnabled",
    "hardLockCooldownMinutes",
    "hardLockPendingDisableUntil",
    "reelsExceptions",
    "confirmBeforeDisable",
    "confirmBeforePause",
    "scheduleEnabled",
    "scheduleStartTime",
    "scheduleEndTime",
    "scheduleDays"
]);

const VALID_BLOCK_MODES = new Set(["strict", "hide_only"]);
const MIN_PAUSE_MINUTES = 5;
const MAX_PAUSE_MINUTES = 180;
const MIN_HARD_LOCK_COOLDOWN_MINUTES = 0;
const MAX_HARD_LOCK_COOLDOWN_MINUTES = 180;
const BADGE_STYLES = Object.freeze({
    ON: {
        text: "on",
        color: "#0A84FF",
        titleKey: "badgeTitleOn",
        titleFallback: "Reels blocker is active"
    },
    OFF: {
        text: "OFF",
        color: "#6E6E73",
        titleKey: "badgeTitleOff",
        titleFallback: "Reels blocker is disabled"
    },
    PAUS: {
        text: "PAUS",
        color: "#FF9F0A",
        titleKey: "badgeTitlePaused",
        titleFallback: "Reels blocker is paused"
    }
});

const storageGet = (keys) => new Promise((resolve) => chrome.storage.local.get(keys, resolve));
const storageSet = (items) => new Promise((resolve) => chrome.storage.local.set(items, resolve));
const clearAlarm = (name) => new Promise((resolve) => chrome.alarms.clear(name, resolve));

const normalizeFutureTimestamp = (value, now = Date.now()) => {
    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > now ? timestamp : null;
};

const normalizeBlockMode = (value) => {
    return VALID_BLOCK_MODES.has(value) ? value : DEFAULT_SETTINGS.blockMode;
};

const normalizeMinuteSetting = (value, defaultValue, minValue, maxValue) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        return defaultValue;
    }

    const rounded = Math.round(parsed);
    if (rounded < minValue || rounded > maxValue) {
        return defaultValue;
    }

    return rounded;
};

const normalizeDefaultPauseMinutes = (value) => {
    return normalizeMinuteSetting(value, DEFAULT_SETTINGS.defaultPauseMinutes, MIN_PAUSE_MINUTES, MAX_PAUSE_MINUTES);
};

const normalizeHardLockCooldownMinutes = (value) => {
    return normalizeMinuteSetting(
        value,
        DEFAULT_SETTINGS.hardLockCooldownMinutes,
        MIN_HARD_LOCK_COOLDOWN_MINUTES,
        MAX_HARD_LOCK_COOLDOWN_MINUTES
    );
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
        return [...DEFAULT_SETTINGS.scheduleDays];
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
        return [...DEFAULT_SETTINGS.scheduleDays];
    }

    return normalized;
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

const normalizeBoolean = (value, fallback) => {
    return typeof value === "boolean" ? value : fallback;
};

const areArraysEqual = (first, second) => {
    if (first.length !== second.length) {
        return false;
    }

    for (let index = 0; index < first.length; index += 1) {
        if (first[index] !== second[index]) {
            return false;
        }
    }

    return true;
};

const parseTimeToMinutes = (timeString) => {
    const [hourPart, minutePart] = timeString.split(":");
    return Number(hourPart) * 60 + Number(minutePart);
};

const isNowInsideScheduleWindow = (scheduleEnabled, startTime, endTime, scheduleDays, nowDate = new Date()) => {
    if (!scheduleEnabled) {
        return false;
    }

    const nowDay = nowDate.getDay();
    const previousDay = (nowDay + 6) % 7;
    const nowMinutes = nowDate.getHours() * 60 + nowDate.getMinutes();
    const startMinutes = parseTimeToMinutes(startTime);
    const endMinutes = parseTimeToMinutes(endTime);

    if (startMinutes === endMinutes) {
        return scheduleDays.includes(nowDay);
    }

    if (startMinutes < endMinutes) {
        return scheduleDays.includes(nowDay) && nowMinutes >= startMinutes && nowMinutes < endMinutes;
    }

    if (nowMinutes >= startMinutes) {
        return scheduleDays.includes(nowDay);
    }

    if (nowMinutes < endMinutes) {
        return scheduleDays.includes(previousDay);
    }

    return false;
};

const applyBadgeStyle = (style) => {
    chrome.action.setBadgeText({ text: style.text });
    chrome.action.setBadgeBackgroundColor({ color: style.color });
    const localizedTitle = chrome.i18n.getMessage(style.titleKey);
    chrome.action.setTitle({ title: localizedTitle || style.titleFallback });
};

const setBadgeFromState = (effectiveEnabled, pauseUntil) => {
    if (!effectiveEnabled) {
        applyBadgeStyle(BADGE_STYLES.OFF);
        return;
    }

    if (normalizeFutureTimestamp(pauseUntil) !== null) {
        applyBadgeStyle(BADGE_STYLES.PAUS);
        return;
    }

    applyBadgeStyle(BADGE_STYLES.ON);
};

const scheduleSingleAlarm = async (alarmName, triggerAt) => {
    await clearAlarm(alarmName);

    if (triggerAt !== null) {
        chrome.alarms.create(alarmName, { when: triggerAt });
    }
};

const scheduleScheduleTickAlarm = async (scheduleEnabled) => {
    await clearAlarm(SCHEDULE_TICK_ALARM_NAME);

    if (scheduleEnabled) {
        chrome.alarms.create(SCHEDULE_TICK_ALARM_NAME, { periodInMinutes: 1 });
    }
};

const buildNormalizedState = (current) => {
    const now = Date.now();
    const nextState = {
        enabled: typeof current.enabled === "boolean" ? current.enabled : DEFAULT_SETTINGS.enabled,
        effectiveEnabled: typeof current.effectiveEnabled === "boolean" ? current.effectiveEnabled : DEFAULT_SETTINGS.effectiveEnabled,
        blockMode: normalizeBlockMode(current.blockMode),
        defaultPauseMinutes: normalizeDefaultPauseMinutes(current.defaultPauseMinutes),
        pauseUntil: normalizeFutureTimestamp(current.pauseUntil, now),
        reelsExceptions: normalizeExceptions(current.reelsExceptions),
        confirmBeforeDisable: normalizeBoolean(current.confirmBeforeDisable, DEFAULT_SETTINGS.confirmBeforeDisable),
        confirmBeforePause: normalizeBoolean(current.confirmBeforePause, DEFAULT_SETTINGS.confirmBeforePause),
        hardLockEnabled: typeof current.hardLockEnabled === "boolean" ? current.hardLockEnabled : DEFAULT_SETTINGS.hardLockEnabled,
        hardLockCooldownMinutes: normalizeHardLockCooldownMinutes(current.hardLockCooldownMinutes),
        hardLockPendingDisableUntil: normalizeFutureTimestamp(current.hardLockPendingDisableUntil, now),
        scheduleEnabled: typeof current.scheduleEnabled === "boolean" ? current.scheduleEnabled : DEFAULT_SETTINGS.scheduleEnabled,
        scheduleStartTime: normalizeScheduleTime(current.scheduleStartTime, DEFAULT_SETTINGS.scheduleStartTime),
        scheduleEndTime: normalizeScheduleTime(current.scheduleEndTime, DEFAULT_SETTINGS.scheduleEndTime),
        scheduleDays: normalizeScheduleDays(current.scheduleDays)
    };

    const pendingDisableTimestamp = Number(current.hardLockPendingDisableUntil);
    const pendingDisableExpired = Number.isFinite(pendingDisableTimestamp) && pendingDisableTimestamp <= now;

    if (!nextState.hardLockEnabled) {
        nextState.hardLockPendingDisableUntil = null;
    }

    if (nextState.hardLockEnabled && nextState.enabled && pendingDisableExpired) {
        nextState.enabled = false;
        nextState.hardLockPendingDisableUntil = null;
    }

    if (!nextState.enabled) {
        nextState.hardLockPendingDisableUntil = null;
    }

    if (nextState.hardLockEnabled && nextState.pauseUntil !== null) {
        nextState.pauseUntil = null;
    }

    const inScheduleWindow = isNowInsideScheduleWindow(
        nextState.scheduleEnabled,
        nextState.scheduleStartTime,
        nextState.scheduleEndTime,
        nextState.scheduleDays
    );
    nextState.effectiveEnabled = nextState.scheduleEnabled ? inScheduleWindow : nextState.enabled;

    return nextState;
};

const computeUpdates = (current, normalized) => {
    const updates = {};

    STORAGE_KEYS.forEach((key) => {
        const nextValue = normalized[key];
        const currentValue = current[key];

        if (Array.isArray(nextValue)) {
            const normalizedCurrent = Array.isArray(currentValue) ? currentValue : [];
            if (!areArraysEqual(normalizedCurrent, nextValue)) {
                updates[key] = nextValue;
            }
            return;
        }

        if (currentValue !== nextValue) {
            updates[key] = nextValue;
        }
    });

    return updates;
};

const syncRuntimeState = async () => {
    const current = await storageGet(STORAGE_KEYS);
    const normalized = buildNormalizedState(current);
    const updates = computeUpdates(current, normalized);

    if (Object.keys(updates).length > 0) {
        await storageSet(updates);
    }

    await Promise.all([
        scheduleSingleAlarm(PAUSE_ALARM_NAME, normalized.pauseUntil),
        scheduleSingleAlarm(HARD_LOCK_DISABLE_ALARM_NAME, normalized.hardLockPendingDisableUntil),
        scheduleScheduleTickAlarm(normalized.scheduleEnabled)
    ]);

    setBadgeFromState(normalized.effectiveEnabled, normalized.pauseUntil);
};

const runSyncSafely = async () => {
    try {
        await syncRuntimeState();
    } catch (error) {
        console.error("Failed to sync extension state", error);
    }
};

chrome.runtime.onInstalled.addListener(() => {
    runSyncSafely();
});

chrome.runtime.onStartup.addListener(() => {
    runSyncSafely();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") {
        return;
    }

    if (Object.keys(changes).some((key) => STORAGE_KEYS.includes(key))) {
        runSyncSafely();
    }
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (
        alarm.name !== PAUSE_ALARM_NAME
        && alarm.name !== HARD_LOCK_DISABLE_ALARM_NAME
        && alarm.name !== SCHEDULE_TICK_ALARM_NAME
    ) {
        return;
    }

    runSyncSafely();
});

runSyncSafely();
