document.addEventListener("DOMContentLoaded", () => {
    const toggle = document.getElementById("toggle");
    const pauseActionButton = document.getElementById("pause-action");
    const pauseStatus = document.getElementById("pause-status");
    const openOptionsButton = document.getElementById("open-options");

    let enabled = true;
    let effectiveEnabled = true;
    let pauseUntil = null;
    let defaultPauseMinutes = 30;
    let hardLockEnabled = false;
    let hardLockCooldownMinutes = 10;
    let hardLockPendingDisableUntil = null;
    let scheduleEnabled = false;
    let confirmBeforeDisable = false;
    let confirmBeforePause = false;

    const t = (key, substitutions = [], fallback = "") => {
        const localized = chrome.i18n.getMessage(key, substitutions);
        return localized || fallback;
    };

    const applyStaticI18n = () => {
        const nodes = document.querySelectorAll("[data-i18n]");
        nodes.forEach((node) => {
            const key = node.getAttribute("data-i18n");
            if (!key) {
                return;
            }

            const text = t(key);
            if (text) {
                node.textContent = text;
            }
        });
    };

    const normalizeFutureTimestamp = (value) => {
        const timestamp = Number(value);
        return Number.isFinite(timestamp) && timestamp > Date.now() ? timestamp : null;
    };

    const normalizeDefaultPauseMinutes = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return 30;
        }

        const rounded = Math.round(parsed);
        if (rounded < 5 || rounded > 180) {
            return 30;
        }

        return rounded;
    };

    const normalizeHardLockCooldownMinutes = (value) => {
        const parsed = Number(value);
        if (!Number.isFinite(parsed)) {
            return 10;
        }

        const rounded = Math.round(parsed);
        if (rounded < 0 || rounded > 180) {
            return 10;
        }

        return rounded;
    };

    const normalizeBoolean = (value, fallback = false) => {
        return typeof value === "boolean" ? value : fallback;
    };

    const isPauseActive = () => pauseUntil !== null && pauseUntil > Date.now();
    const isPendingDisableActive = () => hardLockPendingDisableUntil !== null && hardLockPendingDisableUntil > Date.now();

    const formatRemainingTime = (targetTimestamp) => {
        const diffMs = Math.max(0, targetTimestamp - Date.now());
        const totalMinutes = Math.ceil(diffMs / 60000);
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        }

        return `${totalMinutes}m`;
    };

    const render = () => {
        const paused = isPauseActive();
        const pendingDisable = isPendingDisableActive();

        if (scheduleEnabled) {
            toggle.checked = effectiveEnabled;
            toggle.disabled = true;
        } else if (pendingDisable) {
            toggle.checked = true;
            toggle.disabled = true;
        } else {
            toggle.checked = enabled;
            toggle.disabled = false;
        }

        if (hardLockEnabled) {
            if (pendingDisable) {
                pauseActionButton.disabled = false;
                pauseActionButton.textContent = t("popupKeepBlocking", [], "Keep blocking");
                pauseStatus.textContent = t(
                    "popupStatusHardLockPending",
                    [formatRemainingTime(hardLockPendingDisableUntil)],
                    `Hard Lock: turning off in ${formatRemainingTime(hardLockPendingDisableUntil)}.`
                );
                return;
            }

            pauseActionButton.disabled = true;
            pauseActionButton.textContent = t("popupHardLockOnButton", [], "Hard Lock on");

            if (scheduleEnabled && !effectiveEnabled) {
                pauseStatus.textContent = t(
                    "popupStatusOutsideSchedule",
                    [],
                    "Outside your schedule. Blocking will auto-enable during schedule."
                );
                return;
            }

            if (!effectiveEnabled) {
                pauseStatus.textContent = t("popupStatusBlockingDisabled", [], "Blocking is disabled.");
                return;
            }

            pauseStatus.textContent = t("popupStatusHardLockOn", [], "Hard Lock is on. Pause is unavailable.");
            return;
        }

        if (!effectiveEnabled) {
            pauseActionButton.textContent = t("popupPauseButton", [String(defaultPauseMinutes)], `Pause ${defaultPauseMinutes}m`);
            pauseActionButton.disabled = true;
            pauseStatus.textContent = scheduleEnabled
                ? t("popupStatusOutsideSchedule", [], "Outside your schedule. Blocking will auto-enable during schedule.")
                : t("popupStatusBlockingDisabled", [], "Blocking is disabled.");
            return;
        }

        pauseActionButton.disabled = false;

        if (paused) {
            pauseActionButton.textContent = t("popupResumeNow", [], "Resume now");
            pauseStatus.textContent = t(
                "popupStatusPaused",
                [formatRemainingTime(pauseUntil)],
                `Paused (${formatRemainingTime(pauseUntil)} left)`
            );
            return;
        }

        pauseActionButton.textContent = t("popupPauseButton", [String(defaultPauseMinutes)], `Pause ${defaultPauseMinutes}m`);
        pauseStatus.textContent = scheduleEnabled
            ? t("popupStatusBlockingActiveSchedule", [], "Blocking active (schedule).")
            : t("popupStatusBlockingActive", [], "Blocking active.");
    };

    const syncFromStorage = (result) => {
        enabled = result.enabled !== false;
        effectiveEnabled = result.effectiveEnabled !== false;
        pauseUntil = normalizeFutureTimestamp(result.pauseUntil);
        defaultPauseMinutes = normalizeDefaultPauseMinutes(result.defaultPauseMinutes);
        hardLockEnabled = result.hardLockEnabled === true;
        hardLockCooldownMinutes = normalizeHardLockCooldownMinutes(result.hardLockCooldownMinutes);
        hardLockPendingDisableUntil = normalizeFutureTimestamp(result.hardLockPendingDisableUntil);
        scheduleEnabled = result.scheduleEnabled === true;
        confirmBeforeDisable = normalizeBoolean(result.confirmBeforeDisable);
        confirmBeforePause = normalizeBoolean(result.confirmBeforePause);
        render();
    };

    applyStaticI18n();

    chrome.storage.local.get(
        [
            "enabled",
            "effectiveEnabled",
            "pauseUntil",
            "defaultPauseMinutes",
            "hardLockEnabled",
            "hardLockCooldownMinutes",
            "hardLockPendingDisableUntil",
            "scheduleEnabled",
            "confirmBeforeDisable",
            "confirmBeforePause"
        ],
        syncFromStorage
    );

    window.setInterval(() => {
        let changed = false;

        if (pauseUntil !== null && pauseUntil <= Date.now()) {
            pauseUntil = null;
            changed = true;
        }

        if (hardLockPendingDisableUntil !== null && hardLockPendingDisableUntil <= Date.now()) {
            hardLockPendingDisableUntil = null;
            changed = true;
        }

        if (changed || isPauseActive() || isPendingDisableActive()) {
            render();
        }
    }, 1000);

    toggle.addEventListener("change", () => {
        if (scheduleEnabled || isPendingDisableActive()) {
            render();
            return;
        }

        const wantsEnabled = toggle.checked;

        if (wantsEnabled) {
            enabled = true;
            hardLockPendingDisableUntil = null;
            chrome.storage.local.set({ enabled: true, hardLockPendingDisableUntil: null });
            render();
            return;
        }

        if (confirmBeforeDisable) {
            const confirmed = window.confirm(
                t("popupConfirmDisable", [], "Turn off blocking?")
            );
            if (!confirmed) {
                render();
                return;
            }
        }

        if (hardLockEnabled) {
            const cooldownMinutes = normalizeHardLockCooldownMinutes(hardLockCooldownMinutes);
            if (cooldownMinutes > 0) {
                hardLockPendingDisableUntil = Date.now() + cooldownMinutes * 60 * 1000;
                chrome.storage.local.set({ hardLockPendingDisableUntil });
                render();
                return;
            }

            enabled = false;
            pauseUntil = null;
            hardLockPendingDisableUntil = null;
            chrome.storage.local.set({
                enabled: false,
                pauseUntil: null,
                hardLockPendingDisableUntil: null
            });
            render();
            return;
        }

        enabled = false;
        pauseUntil = null;
        chrome.storage.local.set({ enabled: false, pauseUntil: null });
        render();
    });

    pauseActionButton.addEventListener("click", () => {
        if (hardLockEnabled) {
            if (isPendingDisableActive()) {
                hardLockPendingDisableUntil = null;
                chrome.storage.local.set({ hardLockPendingDisableUntil: null });
                render();
            }
            return;
        }

        if (!effectiveEnabled) {
            return;
        }

        if (isPauseActive()) {
            if (confirmBeforePause) {
                const confirmedResume = window.confirm(
                    t("popupConfirmResume", [], "Resume blocking now?")
                );
                if (!confirmedResume) {
                    render();
                    return;
                }
            }

            pauseUntil = null;
            chrome.storage.local.set({ pauseUntil: null });
            render();
            return;
        }

        if (confirmBeforePause) {
            const confirmedPause = window.confirm(
                t("popupConfirmPause", [String(defaultPauseMinutes)], `Pause blocking for ${defaultPauseMinutes} minutes?`)
            );
            if (!confirmedPause) {
                render();
                return;
            }
        }

        pauseUntil = Date.now() + defaultPauseMinutes * 60 * 1000;
        chrome.storage.local.set({ pauseUntil });
        render();
    });

    openOptionsButton.addEventListener("click", () => {
        chrome.runtime.openOptionsPage();
        window.close();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") {
            return;
        }

        if (changes.enabled) {
            enabled = changes.enabled.newValue !== false;
        }

        if (changes.effectiveEnabled) {
            effectiveEnabled = changes.effectiveEnabled.newValue !== false;
        }

        if (changes.pauseUntil) {
            pauseUntil = normalizeFutureTimestamp(changes.pauseUntil.newValue);
        }

        if (changes.defaultPauseMinutes) {
            defaultPauseMinutes = normalizeDefaultPauseMinutes(changes.defaultPauseMinutes.newValue);
        }

        if (changes.hardLockEnabled) {
            hardLockEnabled = changes.hardLockEnabled.newValue === true;
        }

        if (changes.hardLockCooldownMinutes) {
            hardLockCooldownMinutes = normalizeHardLockCooldownMinutes(changes.hardLockCooldownMinutes.newValue);
        }

        if (changes.hardLockPendingDisableUntil) {
            hardLockPendingDisableUntil = normalizeFutureTimestamp(changes.hardLockPendingDisableUntil.newValue);
        }

        if (changes.scheduleEnabled) {
            scheduleEnabled = changes.scheduleEnabled.newValue === true;
        }

        if (changes.confirmBeforeDisable) {
            confirmBeforeDisable = normalizeBoolean(changes.confirmBeforeDisable.newValue);
        }

        if (changes.confirmBeforePause) {
            confirmBeforePause = normalizeBoolean(changes.confirmBeforePause.newValue);
        }

        render();
    });
});
