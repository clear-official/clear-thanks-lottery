(() => {
  "use strict";

  const STORAGE_KEY = "clearSummerLoveFestivalRedrawResultV1";
  const DEVICE_ID_KEY = "clearSummerLoveFestivalDeviceIdV1";
  const API_URL = "https://script.google.com/macros/s/AKfycbz_iA0cuy_ynSgivpZk-AF6evYIBVSEQXUvMC-MwFDOxT27T-9bbsjFZ1aijBwELpRRUw/exec";
  const USER_ID_PARAM = "uid";
  const API_TIMEOUT_MS = 30000;
  const LOTTERY_MAX_ATTEMPTS = 2;
  const LOTTERY_RETRY_DELAYS_MS = Object.freeze([1200]);
  const HEALTH_REFRESH_MS = 60000;
  const ANALYTICS_ENABLED = window.__CLEAR_GA_ENABLED__ === true;

  const EVENT_PHASES = Object.freeze({
    LOADING: "LOADING",
    BEFORE_EVENT: "BEFORE_EVENT",
    DRAW_OPEN: "DRAW_OPEN",
    RESULT_VIEW: "RESULT_VIEW",
    ENDED: "ENDED",
    ERROR: "ERROR"
  });

  function trackEvent(eventName, parameters = {}) {
    if (!ANALYTICS_ENABLED || typeof window.gtag !== "function") return;
    window.gtag("event", eventName, parameters);
  }

  const MINIMUM_SPIN_MS = 1800;
  const DRUM_TURN_MS = 560;
  const HANDLE_TURN_MS = 430;
  const STOPPING_MS = 1480;
  const modal = document.getElementById("confirmModal");
  const lotteryScreen = document.getElementById("lotteryScreen");
  const lotteryPlayView = document.getElementById("lotteryPlayView");
  const resultView = document.getElementById("resultView");
  const startLotteryButton = document.getElementById("startLotteryButton");
  const confirmTitle = document.getElementById("confirmTitle");
  const confirmDescription = document.getElementById("confirmDescription");
  const eventPhaseNotice = document.getElementById("eventPhaseNotice");
  const backToNews = document.getElementById("backToNews");
  const mobileEntryBar = document.querySelector(".mobile-entry-bar");
  const openButtons = [...document.querySelectorAll("[data-open-confirm]")];
  const closeButtons = [...document.querySelectorAll("[data-close-confirm]")];
  const returnButtons = [...document.querySelectorAll("[data-return-event]")];

  const interactiveGarapon = document.getElementById("interactiveGarapon");
  const garaponDrum = document.getElementById("garaponDrum");
  const garaponHandleButton = document.getElementById("garaponHandleButton");
  const lotteryBall = document.getElementById("lotteryBall");
  const lotteryStatus = document.getElementById("lotteryStatus");
  const lotteryStatusText = document.getElementById("lotteryStatusText");
  const handlePrompt = document.getElementById("handlePrompt");
  const handlePromptText = document.getElementById("handlePromptText");
  const handlePromptSubtext = document.getElementById("handlePromptSubtext");

  const resultRia = document.getElementById("resultRia");
  const resultRank = document.getElementById("resultRank");
  const resultTitle = document.getElementById("resultTitle");
  const resultPrizeName = document.getElementById("resultPrizeName");
  const resultPrizeHeading = document.getElementById("resultPrizeHeading");
  const resultSpecialSet = document.getElementById("resultSpecialSet");
  const resultPrizeBlock = document.getElementById("resultPrizeBlock");
  const resultPrizeImage = document.getElementById("resultPrizeImage");
  const resultPointRia = document.getElementById("resultPointRia");
  const resultTextOnly = document.getElementById("resultTextOnly");
  const resultMessage = document.getElementById("resultMessage");
  const resultCodeLabel = document.getElementById("resultCodeLabel");
  const resultCode = document.getElementById("resultCode");
  const resultGuide = document.getElementById("resultGuide");
  const resultInvalidWarning = document.getElementById("resultInvalidWarning");
  const resultContactButton = document.getElementById("resultContactButton");
  const participationClaimButton = document.getElementById("participationClaimButton");
  const copyCodeButton = document.getElementById("copyCodeButton");
  const copyToast = document.getElementById("copyToast");

  let lastFocusedElement = null;
  let lotteryState = "idle";
  let canStop = false;
  let minimumSpinTimer = null;
  let drumAnimation = null;
  let handleAnimation = null;
  let pendingResult = null;
  let lotteryRequestPromise = null;
  let lotteryApiError = null;
  let toastTimer = null;
  let healthRefreshTimer = null;
  let recoveryInProgress = false;
  let eventState = {
    phase: EVENT_PHASES.LOADING,
    dates: null,
    serverTimeMs: null,
    receivedAtMs: null,
    message: "開催状況を確認しています…",
    eligibility: null
  };

  function readStoredResult() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  }

  function storeResult(result) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(result));
    } catch {
      // 保存できない環境でも、その場の抽選結果は表示します。
    }
  }

  function createRandomDeviceId() {
    if (window.crypto?.randomUUID) {
      return `DEVICE-${window.crypto.randomUUID().toUpperCase()}`;
    }

    const randomPart = Math.random().toString(36).slice(2, 12).toUpperCase();
    return `DEVICE-${Date.now()}-${randomPart}`;
  }

  function getOrCreateDeviceId() {
    try {
      const stored = localStorage.getItem(DEVICE_ID_KEY);
      if (stored) return stored;

      const created = createRandomDeviceId();
      localStorage.setItem(DEVICE_ID_KEY, created);
      return created;
    } catch {
      return createRandomDeviceId();
    }
  }

  function getUserIdFromUrl() {
    try {
      return new URLSearchParams(window.location.search).get(USER_ID_PARAM)?.trim() || "";
    } catch {
      return "";
    }
  }

  function requestJsonp(parameters) {
    return new Promise((resolve, reject) => {
      const callbackName = `clearLotteryCallback_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const script = document.createElement("script");
      const url = new URL(API_URL);
      let settled = false;

      Object.entries(parameters).forEach(([key, value]) => {
        if (value !== "" && value !== null && value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
      url.searchParams.set("callback", callbackName);

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        script.remove();
        try {
          delete window[callbackName];
        } catch {
          window[callbackName] = undefined;
        }
      };

      const finish = (handler, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        handler(value);
      };

      window[callbackName] = (payload) => finish(resolve, payload);
      script.onerror = () => {
        const error = new Error("抽選サーバーへ接続できませんでした。");
        error.code = "NETWORK_ERROR";
        finish(reject, error);
      };

      const timeoutId = window.setTimeout(() => {
        const error = new Error("抽選サーバーからの応答がタイムアウトしました。");
        error.code = "TIMEOUT";
        finish(reject, error);
      }, API_TIMEOUT_MS);

      script.src = url.toString();
      script.async = true;
      document.head.appendChild(script);
    });
  }

  function wait(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  function isRetryableConnectionError(error) {
    return ["NETWORK_ERROR", "TIMEOUT"].includes(error?.code);
  }

  async function requestHealth() {
    const payload = await requestJsonp({
      action: "health",
      deviceId: getOrCreateDeviceId(),
      userId: getUserIdFromUrl()
    });
    if (!payload?.ok || !payload.phase) {
      throw new Error(payload?.error?.message || "開催状況を確認できませんでした。");
    }
    return payload;
  }

  function parseApiDate(value) {
    if (!value) return null;
    const normalized = String(value).replace(/\//g, "-").replace(" ", "T") + "+09:00";
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function getEstimatedServerNow() {
    if (!Number.isFinite(eventState.serverTimeMs) || !Number.isFinite(eventState.receivedAtMs)) {
      return new Date();
    }
    return new Date(eventState.serverTimeMs + (Date.now() - eventState.receivedAtMs));
  }

  function isPastDeadline(value) {
    const deadline = parseApiDate(value);
    if (!deadline) return false;
    return getEstimatedServerNow().getTime() >= deadline.getTime() + 1000;
  }

  function setConfirmMessage(message) {
    const paragraph = document.createElement("p");
    paragraph.textContent = message;
    confirmDescription.replaceChildren(paragraph);
  }

  function showExcludedModal(eligibility) {
    lastFocusedElement = document.activeElement;
    confirmTitle.textContent = eligibility?.title || "今回は抽選対象外となります";
    setConfirmMessage(
      eligibility?.message ||
      "前回ご当選時のお手続きが期限内に確認できなかったため、今回の再抽選にはご参加いただけません。ご了承くださいませ。"
    );
    startLotteryButton.hidden = true;
    startLotteryButton.disabled = true;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-modal-open");
  }

  function configureConfirmModal(mode, message = "") {
    startLotteryButton.hidden = false;
    if (mode === "result") {
      confirmTitle.textContent = "抽選結果を確認します";
      setConfirmMessage(message || "抽選期間中に利用した端末の結果を確認します。");
      startLotteryButton.textContent = "結果を見る";
      return;
    }

    confirmTitle.textContent = "抽選を始めますか？";
    setConfirmMessage("ガラポンを回して、結果を確認しましょう。");
    startLotteryButton.textContent = "ガラポン画面へ進む";
  }

  function entryButtonState(hasResult) {
    if (eventState.eligibility?.eligible === false) {
      return { label: "今回は抽選対象外です", disabled: true };
    }

    switch (eventState.phase) {
      case EVENT_PHASES.BEFORE_EVENT:
        return { label: "8月11日（火）15:00から開始", disabled: true };
      case EVENT_PHASES.DRAW_OPEN:
        return { label: hasResult ? "抽選結果を確認" : "抽選へ進む", disabled: false };
      case EVENT_PHASES.RESULT_VIEW:
        return { label: hasResult ? "結果を見る" : "抽選受付は終了しました", disabled: !hasResult };
      case EVENT_PHASES.ENDED:
        return { label: "イベントは終了しました", disabled: true };
      case EVENT_PHASES.ERROR:
        return { label: "開催状況を確認できません", disabled: true };
      default:
        return { label: "開催状況を確認中…", disabled: true };
    }
  }

  function applyEventPhaseUi() {
    const storedResult = readStoredResult();
    const state = entryButtonState(Boolean(storedResult));

    openButtons.forEach((button) => {
      button.textContent = state.label;
      button.disabled = state.disabled;
      button.setAttribute("aria-disabled", String(state.disabled));
    });

    if (eventPhaseNotice) {
      eventPhaseNotice.textContent = eventState.message;
      eventPhaseNotice.dataset.phase = eventState.phase;
    }

    if (modal.classList.contains("is-open") && ![EVENT_PHASES.DRAW_OPEN, EVENT_PHASES.RESULT_VIEW].includes(eventState.phase)) {
      startLotteryButton.disabled = true;
      startLotteryButton.textContent = state.label;
    }

    if (resultView.classList.contains("is-participation") && !resultView.hidden) {
      applyParticipationDeadlineState();
    }
  }

  async function refreshEventState({ openStoredResult = false } = {}) {
    try {
      const payload = await requestHealth();
      eventState = {
        phase: payload.phase,
        dates: payload.dates || null,
        serverTimeMs: Date.parse(payload.serverTime),
        receivedAtMs: Date.now(),
        eligibility: payload.eligibility || { eligible: true },
        message:
          payload.eligibility?.eligible === false
            ? "今回は再抽選の対象外となります。"
            : payload.phase === EVENT_PHASES.BEFORE_EVENT
              ? "8月11日（火）15:00から参加できます。"
              : payload.phase === EVENT_PHASES.DRAW_OPEN
                ? "ガラポン再抽選を開催中です。"
                : payload.phase === EVENT_PHASES.RESULT_VIEW
                  ? "抽選受付は終了しました。抽選済みの方は8月14日（金）15:00まで結果を確認できます。"
                  : "イベントは終了しました。"
      };
      applyEventPhaseUi();

      if (payload.eligibility?.eligible === false) {
        window.setTimeout(() => showExcludedModal(payload.eligibility), 120);
        return;
      }

      const storedResult = readStoredResult();
      if (openStoredResult && storedResult && [EVENT_PHASES.DRAW_OPEN, EVENT_PHASES.RESULT_VIEW].includes(eventState.phase)) {
        window.setTimeout(() => openResultScreen(storedResult), 120);
      }
    } catch (error) {
      eventState = {
        phase: EVENT_PHASES.ERROR,
        dates: null,
        serverTimeMs: null,
        receivedAtMs: Date.now(),
        message: "開催状況を確認できません。通信環境を確認してページを再読み込みしてください。",
        eligibility: null
      };
      applyEventPhaseUi();
      trackEvent("event_health_error", { error_message: error?.message || "unknown_error" });
    }
  }

  const BALL_COLOR_MAP = Object.freeze({
    "金": "gold",
    "赤": "red",
    "紫": "purple",
    "青": "blue",
    "白": "white",
    "銀": "silver",
    "ピンク": "pink"
  });

  const RESULT_DETAILS = Object.freeze({
    P01: {
      title: "日本でも著名な縁結び神社⛩️\n難波八阪神社\n恋鯉みくじ＋縁結びおまもり",
      message: "難波八阪神社の恋鯉みくじと縁結びおまもりをセットでお届けします🎁\n※恋みくじ・おまもりの種類はランダムです。",
      ria: "assets/ria-win.png"
    },
    P02: {
      message: "心を整えるひとときにお使いください🎁",
      ria: "assets/ria-win.png"
    },
    P03: {
      message: "毎日のケアにお役立てください🎁",
      ria: "assets/ria-win.png"
    },
    P04: {
      message: "手元のケアにお役立てください🎁",
      ria: "assets/ria-win.png"
    },
    P05: {
      message: "恋の運勢をお楽しみください🎁",
      ria: "assets/ria-win.png"
    },
    P06: {
      message: "ポイントをプレゼントします🎉",
      ria: "assets/ria-win.png",
      textOnly: "1,000pt"
    },
    P07: {
      message: "ポイントをプレゼントします🎉",
      ria: "assets/ria-win.png",
      textOnly: "500pt"
    },
    P08: {
      message: "ポイントをプレゼントします🎉",
      ria: "assets/ria-win.png",
      textOnly: "100pt"
    },
    P00: {
      message: "当選しなかった方には、参加賞として10ptをプレゼントします🎁",
      ria: "assets/ria-participation.png",
      isParticipation: true
    }
  });

  function mapApiResult(apiResult) {
    if (!apiResult?.prizeId) {
      throw new Error("抽選結果の形式が正しくありません。");
    }

    const details = RESULT_DETAILS[apiResult.prizeId] || {};
    const isParticipation = apiResult.prizeId === "P00" || apiResult.prizeType === "参加賞";
    const PRIZE_COLOR_BY_ID = {
      P01: "gold",
      P02: "red",
      P03: "purple",
      P04: "blue",
      P05: "white",
      P06: "silver",
      P07: "silver",
      P08: "silver",
      P00: "pink"
    };
    const color =
      BALL_COLOR_MAP[apiResult.ballColor] ||
      PRIZE_COLOR_BY_ID[apiResult.prizeId] ||
      (isParticipation ? "pink" : "silver");

    return {
      drawId: apiResult.drawId || "",
      prizeId: apiResult.prizeId,
      color,
      rank: apiResult.rank,
      title: details.title || apiResult.prizeName,
      image: apiResult.imagePath || "",
      message: details.message || "おめでとうございます！",
      ria: details.ria || (isParticipation ? "assets/ria-participation.png" : "assets/ria-win.png"),
      textOnly: details.textOnly || "",
      isParticipation,
      code: isParticipation ? apiResult.presentCode : apiResult.claimCode,
      codeType: apiResult.codeType || "",
      claimDeadline: apiResult.claimDeadline || "",
      createdAt: apiResult.drawnAt || new Date().toISOString()
    };
  }

  async function requestLotteryResult({
    maxAttempts = LOTTERY_MAX_ATTEMPTS,
    onRetry = null
  } = {}) {
    const requestParameters = {
      action: "draw",
      deviceId: getOrCreateDeviceId(),
      userId: getUserIdFromUrl()
    };

    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const payload = await requestJsonp(requestParameters);

        if (!payload?.ok) {
          const apiError = new Error(payload?.error?.message || "抽選処理に失敗しました。");
          apiError.code = payload?.error?.code || "API_ERROR";
          apiError.title = payload?.error?.title || "";
          throw apiError;
        }

        return mapApiResult(payload.result);
      } catch (error) {
        lastError = error;
        const canRetry = isRetryableConnectionError(error) && attempt < maxAttempts;
        if (!canRetry) throw error;

        if (typeof onRetry === "function") {
          onRetry({ attempt, maxAttempts, error });
        }

        const delay = LOTTERY_RETRY_DELAYS_MS[Math.min(attempt - 1, LOTTERY_RETRY_DELAYS_MS.length - 1)] || 1200;
        await wait(delay);
      }
    }

    throw lastError || new Error("抽選結果を確認できませんでした。");
  }

  function openConfirmModal() {
    if (![EVENT_PHASES.DRAW_OPEN, EVENT_PHASES.RESULT_VIEW].includes(eventState.phase)) {
      applyEventPhaseUi();
      return;
    }

    const storedResult = readStoredResult();
    if (storedResult) {
      openResultScreen(storedResult);
      return;
    }

    lastFocusedElement = document.activeElement;
    trackEvent(eventState.phase === EVENT_PHASES.RESULT_VIEW ? "result_lookup_open" : "lottery_confirm_open");
    configureConfirmModal(eventState.phase === EVENT_PHASES.RESULT_VIEW ? "result" : "draw");
    startLotteryButton.disabled = false;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-modal-open");
    startLotteryButton.focus();
  }

  function closeConfirmModal() {
    modal.classList.remove("is-open");
    startLotteryButton.hidden = false;
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-modal-open");
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
  }

  async function lookupExistingResult() {
    startLotteryButton.disabled = true;
    startLotteryButton.textContent = "確認中…";
    confirmTitle.textContent = "抽選結果を確認しています";
    setConfirmMessage("画面を閉じずに少しお待ちください。");

    try {
      const result = await requestLotteryResult();
      storeResult(result);
      closeConfirmModal();
      openResultScreen(result);
    } catch (error) {
      confirmTitle.textContent = "結果を確認できませんでした";
      setConfirmMessage(error?.message || "抽選結果の確認に失敗しました。");
      startLotteryButton.disabled = false;
      startLotteryButton.textContent = "もう一度確認";
      trackEvent("result_lookup_error", { error_message: error?.message || "unknown_error" });
      await refreshEventState();
    }
  }

  function openLotteryScreen() {
    trackEvent("lottery_start");
    closeConfirmModal();
    resetLotteryAnimation();
    lotteryPlayView.hidden = false;
    resultView.hidden = true;
    lotteryScreen.classList.add("is-open");
    lotteryScreen.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-lottery-open");
    window.setTimeout(() => garaponHandleButton.focus({ preventScroll: true }), 220);
  }

  function openResultScreen(result) {
    closeConfirmModal();
    stopActiveAnimations();
    renderResult(result);
    lotteryPlayView.hidden = true;
    resultView.hidden = false;
    lotteryState = "complete";
    lotteryScreen.classList.add("is-open");
    lotteryScreen.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-lottery-open");
  }

  function canLeaveLotteryScreen() {
    return ["idle", "recovery", "complete"].includes(lotteryState);
  }

  function closeLotteryScreen() {
    if (!canLeaveLotteryScreen()) {
      nudgeStatus("抽選中は画面を閉じられません");
      return;
    }

    stopActiveAnimations();
    lotteryScreen.classList.remove("is-open");
    lotteryScreen.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-lottery-open");
    document.getElementById("garapon-title")?.scrollIntoView({ behavior: "smooth" });
  }

  function setState(nextState) {
    lotteryState = nextState;
    interactiveGarapon.dataset.state = nextState;
    lotteryPlayView.dataset.lotteryState = nextState;
  }

  function setStatus(message, icon = "☾") {
    lotteryStatusText.textContent = message;
    const iconElement = lotteryStatus.querySelector(".lottery-status__icon");
    if (iconElement) iconElement.textContent = icon;
  }

  function nudgeStatus(message) {
    setStatus(message, "✦");
    lotteryStatus.classList.remove("is-nudging");
    void lotteryStatus.offsetWidth;
    lotteryStatus.classList.add("is-nudging");
  }

  function startContinuousAnimations() {
    drumAnimation = garaponDrum.animate(
      [{ transform: "translateX(-50%) rotate(0deg)" }, { transform: "translateX(-50%) rotate(360deg)" }],
      { duration: DRUM_TURN_MS, iterations: Infinity, easing: "linear" }
    );
    handleAnimation = garaponHandleButton.animate(
      [{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }],
      { duration: HANDLE_TURN_MS, iterations: Infinity, easing: "linear" }
    );
  }

  function currentAngle(animation, duration) {
    if (!animation || animation.currentTime === null) return 0;
    return ((Number(animation.currentTime) % duration) / duration) * 360;
  }

  function stopActiveAnimations() {
    if (minimumSpinTimer) {
      window.clearTimeout(minimumSpinTimer);
      minimumSpinTimer = null;
    }
    [drumAnimation, handleAnimation].forEach((animation) => animation?.cancel());
    drumAnimation = null;
    handleAnimation = null;
  }

  function beginSpin() {
    if (lotteryState !== "idle") return;

    recoveryInProgress = false;
    interactiveGarapon.classList.remove("is-recovery");
    trackEvent("lottery_spin_start");
    setState("spinning-locked");
    canStop = false;
    returnButtons.forEach((button) => { button.disabled = true; });
    lotteryBall.className = "lottery-ball";
    garaponHandleButton.setAttribute("aria-label", "ガラポンが回転中です。もう少し待ってください");
    setStatus("ガラポンが回転中…", "✦");
    handlePromptText.textContent = "くるくる回転中…";
    handlePromptSubtext.textContent = "演出が切り替わったらもう一度タップ";
    handlePrompt.classList.add("is-spinning");
    interactiveGarapon.classList.add("is-starting");
    window.setTimeout(() => interactiveGarapon.classList.remove("is-starting"), 460);
    startContinuousAnimations();

    lotteryApiError = null;
    lotteryRequestPromise = requestLotteryResult({
      onRetry: ({ attempt, maxAttempts }) => {
        setStatus(`通信状況を確認しています…（${attempt + 1}/${maxAttempts}）`, "↻");
        handlePromptText.textContent = "結果を確認中…";
        handlePromptSubtext.textContent = "画面を閉じずにお待ちください";
      }
    }).catch((error) => {
      lotteryApiError = error;
      return null;
    });

    minimumSpinTimer = window.setTimeout(() => {
      canStop = true;
      setState("spinning-ready");
      setStatus("好きなタイミングでガラポン全体をタップ", "☝");
      handlePromptText.textContent = "ガラポン全体をタップ";
      handlePromptSubtext.textContent = "止まると玉が出ます";
      garaponHandleButton.setAttribute("aria-label", "ガラポン全体をもう一度タップして回転を止める");
      handlePrompt.classList.add("is-ready");
    }, MINIMUM_SPIN_MS);
  }

  function handleEarlyStopAttempt() {
    nudgeStatus("もう少しだけ回してね…");
    interactiveGarapon.classList.remove("is-early-tap");
    void interactiveGarapon.offsetWidth;
    interactiveGarapon.classList.add("is-early-tap");
  }

  async function stopSpin() {
    if (lotteryState !== "spinning-ready" || !canStop) return;

    canStop = false;
    setState("stopping");
    handlePrompt.classList.remove("is-ready");
    setStatus("回転が止まります…", "✦");
    handlePromptText.textContent = "ストップ";
    handlePromptSubtext.textContent = "玉が出るまで少しお待ちください";
    garaponHandleButton.disabled = true;

    const drumStartAngle = currentAngle(drumAnimation, DRUM_TURN_MS);
    const handleStartAngle = currentAngle(handleAnimation, HANDLE_TURN_MS);
    stopActiveAnimations();

    interactiveGarapon.classList.add("is-stopping");

    const drumStoppingAnimation = garaponDrum.animate(
      [
        { offset: 0, transform: `translateX(-50%) rotate(${drumStartAngle}deg)` },
        { offset: .42, transform: `translateX(-50%) rotate(${drumStartAngle + 430}deg)` },
        { offset: .72, transform: `translateX(-50%) rotate(${drumStartAngle + 650}deg)` },
        { offset: .9, transform: `translateX(-50%) rotate(${drumStartAngle + 742}deg)` },
        { offset: 1, transform: `translateX(-50%) rotate(${drumStartAngle + 770}deg)` }
      ],
      { duration: STOPPING_MS, easing: "cubic-bezier(.18,.76,.18,1)", fill: "forwards" }
    );
    const handleStoppingAnimation = garaponHandleButton.animate(
      [
        { offset: 0, transform: `rotate(${handleStartAngle}deg)` },
        { offset: .48, transform: `rotate(${handleStartAngle + 400}deg)` },
        { offset: .78, transform: `rotate(${handleStartAngle + 600}deg)` },
        { offset: 1, transform: `rotate(${handleStartAngle + 705}deg)` }
      ],
      { duration: STOPPING_MS * .92, easing: "cubic-bezier(.18,.76,.18,1)", fill: "forwards" }
    );

    try {
      await Promise.all([drumStoppingAnimation.finished, handleStoppingAnimation.finished]);
      interactiveGarapon.classList.remove("is-stopping");
      ejectBall();
    } catch {
      resetLotteryAnimation();
    }
  }

  async function ejectBall() {
    setState("ejecting");
    setStatus("抽選結果を確認しています…", "●");
    handlePromptText.textContent = "カラカラ…";
    handlePromptSubtext.textContent = "どの色が出るかな？";

    const result = await lotteryRequestPromise;
    if (!result) {
      const errorMessage = lotteryApiError?.message || "抽選結果を確認できませんでした。";
      trackEvent("lottery_error", {
        error_message: errorMessage,
        recovery_available: true
      });

      resetLotteryAnimation();

      if (!isRetryableConnectionError(lotteryApiError)) {
        if (lotteryApiError?.code === "REDRAW_EXCLUDED") {
          closeLotteryScreen();
          showExcludedModal({
            title: lotteryApiError.title || "今回は抽選対象外となります",
            message: lotteryApiError.message
          });
          refreshEventState();
          return;
        }

        nudgeStatus(errorMessage);
        refreshEventState();
        return;
      }

      setState("recovery");
      interactiveGarapon.classList.add("is-recovery");
      garaponHandleButton.setAttribute("aria-label", "ガラポン全体をタップして抽選結果を再確認する");
      handlePromptText.textContent = "抽選結果を再確認";
      handlePromptSubtext.textContent = "ガラポン全体をタップ";
      nudgeStatus("通信が不安定です。結果を再確認してください。");
      refreshEventState();
      return;
    }

    pendingResult = result;
    const color = result.color;
    lotteryBall.className = `lottery-ball lottery-ball--${color} is-ejected`;
    interactiveGarapon.classList.add("is-ejecting");

    window.setTimeout(() => completeLottery(), 1650);
  }

  function completeLottery() {
    if (!pendingResult) return;
    setState("complete");
    trackEvent("lottery_complete", {
      prize_rank: pendingResult.rank,
      prize_name: pendingResult.title,
      prize_color: pendingResult.color,
      is_participation: pendingResult.isParticipation === true
    });
    storeResult(pendingResult);
    updateEntryButtons(true);
    openResultScreen(pendingResult);
    pendingResult = null;
    returnButtons.forEach((button) => { button.disabled = false; });
  }

  function resetLotteryAnimation() {
    stopActiveAnimations();
    setState("idle");
    canStop = false;
    recoveryInProgress = false;
    pendingResult = null;
    lotteryRequestPromise = null;
    lotteryApiError = null;

    garaponDrum.getAnimations().forEach((animation) => animation.cancel());
    garaponHandleButton.getAnimations().forEach((animation) => animation.cancel());
    garaponDrum.style.transform = "";
    garaponHandleButton.style.transform = "";
    garaponHandleButton.disabled = false;
    garaponHandleButton.setAttribute("aria-label", "ガラポン全体をタップして回転を始める");
    lotteryBall.className = "lottery-ball";
    interactiveGarapon.classList.remove("is-ejecting", "is-early-tap", "is-recovery");
    handlePrompt.classList.remove("is-spinning", "is-ready");
    interactiveGarapon.classList.remove("is-starting", "is-stopping", "is-ejecting");
    handlePromptText.textContent = "ガラポン全体をタップ";
    handlePromptSubtext.textContent = "1回目で回転スタート";
    setStatus("ガラポン全体をタップしてください", "☾");
    returnButtons.forEach((button) => { button.disabled = false; });
  }

  function renderResult(result) {
    const isParticipation = result.isParticipation === true || result.rank === "参加賞" || result.color === "pink";

    resultView.classList.toggle("is-participation", isParticipation);
    resultRia.src = isParticipation ? "assets/ria-participation.png" : (result.ria || "assets/ria-win.png");
    resultRia.alt = isParticipation ? "参加賞を案内するリアちゃん" : "当選を喜ぶリアちゃん";
    const isSpecialPrize = !isParticipation && result.color === "gold";
    const isPointPrize = ["P06", "P07", "P08"].includes(result.prizeId);
    const showGiftRia = isParticipation || isPointPrize;

    resultRank.textContent = isParticipation ? "参加賞" : result.rank;
    resultTitle.textContent = isParticipation ? "ご参加ありがとうございます！🎁" : "おめでとうございます！✨";
    resultPrizeName.textContent = isParticipation ? "10pt" : result.title;
    resultPrizeName.hidden = false;
    resultPrizeHeading.hidden = false;
    resultPrizeName.classList.toggle("is-special", isSpecialPrize);
    resultMessage.textContent = isParticipation
      ? "当選しなかった方には、参加賞として10ptをプレゼントします🎁"
      : result.message;
    resultCodeLabel.textContent = isParticipation ? "プレゼントコード" : "参加コード";
    resultCode.textContent = result.code || (isParticipation ? "KOIMATURI2" : "");
    resultGuide.textContent = isParticipation
      ? "マイページ ＞ キャンペーンコード入力でも受け取りが可能です。\n※受け取り期限：8/14（金）24:00"
      : "景品・ポイントのお受け取りは、参加コードをコピーの上、お問い合わせ窓口までお送りください。";

    resultInvalidWarning.hidden = isParticipation;
    resultContactButton.hidden = isParticipation;
    participationClaimButton.hidden = !isParticipation;
    resultPrizeBlock.hidden = false;

    resultSpecialSet.hidden = !isSpecialPrize;
    resultPointRia.hidden = !showGiftRia;

    if (showGiftRia) {
      resultPrizeImage.hidden = true;
      resultPrizeImage.removeAttribute("src");
      resultPrizeImage.alt = "";
      resultTextOnly.hidden = true;
      resultTextOnly.textContent = "";
    } else if (isSpecialPrize) {
      resultPrizeImage.hidden = true;
      resultPrizeImage.removeAttribute("src");
      resultPrizeImage.alt = "";
      resultTextOnly.hidden = true;
      resultTextOnly.textContent = "";
    } else if (result.image) {
      resultPrizeImage.hidden = false;
      resultPrizeImage.src = result.image;
      resultPrizeImage.alt = result.title;
      resultTextOnly.hidden = true;
      resultTextOnly.textContent = "";
    } else {
      resultPrizeImage.hidden = true;
      resultPrizeImage.removeAttribute("src");
      resultPrizeImage.alt = "";
      resultTextOnly.hidden = true;
      resultTextOnly.textContent = "";
    }

    applyParticipationDeadlineState();
  }

  function applyParticipationDeadlineState() {
    const isParticipation = resultView.classList.contains("is-participation");
    if (!isParticipation) return;

    const expired = isPastDeadline(eventState.dates?.presentDeadline);
    participationClaimButton.hidden = expired;
    resultGuide.textContent = expired
      ? "受け取り期限は終了しました。"
      : "マイページ ＞ キャンペーンコード入力でも受け取りが可能です。\n※受け取り期限：8/14（金）24:00";
  }

  function updateEntryButtons(hasResult) {
    const state = entryButtonState(hasResult);
    openButtons.forEach((button) => {
      button.textContent = state.label;
      button.disabled = state.disabled;
      button.setAttribute("aria-disabled", String(state.disabled));
    });
  }

  async function recoverLotteryResult() {
    if (lotteryState !== "recovery" || recoveryInProgress) return;

    recoveryInProgress = true;
    setState("recovering");
    garaponHandleButton.disabled = true;
    returnButtons.forEach((button) => { button.disabled = true; });
    setStatus("保存済みの抽選結果を再確認しています…", "↻");
    handlePromptText.textContent = "結果を再確認中…";
    handlePromptSubtext.textContent = "画面を閉じずにお待ちください";

    try {
      const result = await requestLotteryResult({
        onRetry: ({ attempt, maxAttempts }) => {
          setStatus(`抽選結果を再確認しています…（${attempt + 1}/${maxAttempts}）`, "↻");
        }
      });

      trackEvent("lottery_recovery_success", {
        prize_rank: result.rank,
        prize_name: result.title
      });
      storeResult(result);
      updateEntryButtons(true);
      openResultScreen(result);
    } catch (error) {
      trackEvent("lottery_recovery_error", {
        error_message: error?.message || "unknown_error"
      });

      if (!isRetryableConnectionError(error)) {
        resetLotteryAnimation();

        if (error?.code === "REDRAW_EXCLUDED") {
          closeLotteryScreen();
          showExcludedModal({
            title: error.title || "今回は抽選対象外となります",
            message: error.message
          });
          refreshEventState();
          return;
        }

        nudgeStatus(error?.message || "抽選結果を確認できませんでした。");
        refreshEventState();
        return;
      }

      setState("recovery");
      interactiveGarapon.classList.add("is-recovery");
      garaponHandleButton.disabled = false;
      returnButtons.forEach((button) => { button.disabled = false; });
      handlePromptText.textContent = "もう一度結果を確認";
      handlePromptSubtext.textContent = "ガラポン全体をタップ";
      nudgeStatus("結果を確認できませんでした。通信環境を確認してもう一度お試しください。");
    } finally {
      recoveryInProgress = false;
    }
  }

  function handleGaraponTap() {
    if (lotteryState === "idle") return beginSpin();
    if (lotteryState === "spinning-locked") return handleEarlyStopAttempt();
    if (lotteryState === "spinning-ready") return stopSpin();
    if (lotteryState === "recovery") return recoverLotteryResult();
  }

  function showCopyToast() {
    window.clearTimeout(toastTimer);
    copyToast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => copyToast.classList.remove("is-visible"), 1800);
  }

  async function copyCode() {
    const code = resultCode.textContent.trim();
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    trackEvent("code_copy", {
      code_type: resultView.classList.contains("is-participation") ? "present_code" : "claim_code",
      prize_rank: resultRank.textContent.trim()
    });
    showCopyToast();
  }

  function handleEscape(event) {
    if (event.key !== "Escape") return;
    if (lotteryScreen.classList.contains("is-open")) return closeLotteryScreen();
    if (modal.classList.contains("is-open")) closeConfirmModal();
  }

  function updateMobileEntryBar() {
    if (!mobileEntryBar) return;
    mobileEntryBar.setAttribute("aria-hidden", "false");
    const button = mobileEntryBar.querySelector("button");
    if (button) button.tabIndex = 0;
  }

  openButtons.forEach((button) => button.addEventListener("click", openConfirmModal));
  closeButtons.forEach((button) => button.addEventListener("click", closeConfirmModal));
  returnButtons.forEach((button) => button.addEventListener("click", closeLotteryScreen));
  startLotteryButton.addEventListener("click", () => {
    if (eventState.phase === EVENT_PHASES.RESULT_VIEW) {
      lookupExistingResult();
      return;
    }
    if (eventState.phase === EVENT_PHASES.DRAW_OPEN) openLotteryScreen();
  });
  interactiveGarapon.addEventListener("click", (event) => {
    if (event.target.closest("[data-return-event], a")) return;
    handleGaraponTap();
  });
  copyCodeButton.addEventListener("click", copyCode);
  document.querySelectorAll('a[href="https://app-clear.com/open?act=page_contact"]').forEach((link) => {
    link.addEventListener("click", () => trackEvent("contact_click", {
      prize_rank: resultView.classList.contains("is-participation") ? "" : resultRank.textContent.trim(),
      source: link.id === "resultContactButton" ? "result" : "guide"
    }));
  });
  participationClaimButton.addEventListener("click", () => trackEvent("participation_claim_click", {
    reward_point: 10,
    present_code: "KOIMATURI2"
  }));
  document.addEventListener("keydown", handleEscape);
  window.addEventListener("resize", updateMobileEntryBar);

  backToNews.addEventListener("click", (event) => {
    event.preventDefault();
    if (window.history.length > 1) window.history.back();
  });

  updateEntryButtons(Boolean(readStoredResult()));
  updateMobileEntryBar();
  refreshEventState({ openStoredResult: true });

  healthRefreshTimer = window.setInterval(() => refreshEventState(), HEALTH_REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshEventState();
  });
  window.addEventListener("beforeunload", () => {
    if (healthRefreshTimer) window.clearInterval(healthRefreshTimer);
  });
})();
