(() => {
  "use strict";

  const STORAGE_KEY = "clearSummerLoveFestivalResultV3";
  const DEVICE_ID_KEY = "clearSummerLoveFestivalDeviceIdV1";
  const API_URL = "https://script.google.com/macros/s/AKfycbz_iA0cuy_ynSgivpZk-AF6evYIBVSEQXUvMC-MwFDOxT27T-9bbsjFZ1aijBwELpRRUw/exec";
  const USER_ID_PARAM = "uid";
  const API_TIMEOUT_MS = 15000;
  const TEST_MODE =
    window.location.protocol === "file:" ||
    new URLSearchParams(window.location.search).get("test") === "1";
  const ANALYTICS_ENABLED = window.__CLEAR_GA_ENABLED__ === true;

  function trackEvent(eventName, parameters = {}) {
    if (!ANALYTICS_ENABLED || typeof window.gtag !== "function") return;
    window.gtag("event", eventName, parameters);
  }

  const MINIMUM_SPIN_MS = 1800;
  const DRUM_TURN_MS = 560;
  const HANDLE_TURN_MS = 430;
  const STOPPING_MS = 1480;
  const BALL_COLORS = ["gold", "red", "purple", "blue", "white", "silver", "pink"];

  const PRIZES = {
    gold: {
      rank: "特等",
      title: "恋鯉みくじ＋恋愛成就お守りセット",
      image: "assets/prize-special-set.png",
      message: "恋鯉みくじと恋愛成就のお守りをセットでお届けします🎁\n※恋鯉みくじ・お守りの種類はランダムです。",
      ria: "assets/ria-win.png"
    },
    red: {
      rank: "1等",
      title: "お浄め塩キャンドル",
      image: "assets/prize-candle.webp",
      message: "心を整えるひとときにお使いください🎁",
      ria: "assets/ria-win.png"
    },
    purple: {
      rank: "2等",
      title: "お浄めヘアトリートメント",
      image: "assets/prize-treatment.png",
      message: "毎日のケアにお役立てください🎁",
      ria: "assets/ria-win.png"
    },
    blue: {
      rank: "3等",
      title: "お浄め塩ハンドクリーム",
      image: "assets/prize-handcream.png",
      message: "手元のケアにお役立てください🎁",
      ria: "assets/ria-win.png"
    },
    white: {
      rank: "4等",
      title: "恋鯉みくじ",
      image: "assets/prize-koikoi.png",
      message: "恋の運勢をお楽しみください🎁",
      ria: "assets/ria-win.png"
    },
    pink: {
      rank: "参加賞",
      title: "参加賞おめでとう！",
      message: "残念…\n今回は景品は当たりませんでしたが、参加賞として10ptをプレゼント🎁",
      ria: "assets/ria-participation.png",
      isParticipation: true,
      code: "KOIMATSURI"
    }
  };

  const modal = document.getElementById("confirmModal");
  const lotteryScreen = document.getElementById("lotteryScreen");
  const lotteryPlayView = document.getElementById("lotteryPlayView");
  const resultView = document.getElementById("resultView");
  const startLotteryButton = document.getElementById("startLotteryButton");
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
      script.onerror = () => finish(reject, new Error("抽選サーバーへ接続できませんでした。"));

      const timeoutId = window.setTimeout(() => {
        finish(reject, new Error("抽選サーバーからの応答がタイムアウトしました。"));
      }, API_TIMEOUT_MS);

      script.src = url.toString();
      script.async = true;
      document.head.appendChild(script);
    });
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
      message: "恋鯉みくじと恋愛成就のお守りをセットでお届けします🎁\n※恋鯉みくじ・お守りの種類はランダムです。",
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
      message: "残念…\n今回は景品は当たりませんでしたが、参加賞として10ptをプレゼント🎁",
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
    const color = BALL_COLOR_MAP[apiResult.ballColor] || (isParticipation ? "pink" : "silver");

    return {
      drawId: apiResult.drawId || "",
      prizeId: apiResult.prizeId,
      color,
      rank: apiResult.rank,
      title: apiResult.prizeName,
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

  async function requestLotteryResult() {
    const payload = await requestJsonp({
      action: "draw",
      deviceId: getOrCreateDeviceId(),
      userId: getUserIdFromUrl()
    });

    if (!payload?.ok) {
      throw new Error(payload?.error?.message || "抽選処理に失敗しました。");
    }

    return mapApiResult(payload.result);
  }

  function openConfirmModal() {
    const storedResult = readStoredResult();
    if (storedResult) {
      openResultScreen(storedResult);
      return;
    }

    lastFocusedElement = document.activeElement;
    trackEvent("lottery_confirm_open");
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("is-modal-open");
    startLotteryButton.focus();
  }

  function closeConfirmModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("is-modal-open");
    if (lastFocusedElement instanceof HTMLElement) lastFocusedElement.focus();
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
    return lotteryState === "idle" || lotteryState === "complete";
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
    document.getElementById("event-guide")?.scrollIntoView({ behavior: "smooth" });
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
    lotteryRequestPromise = requestLotteryResult().catch((error) => {
      lotteryApiError = error;
      return null;
    });

    minimumSpinTimer = window.setTimeout(() => {
      canStop = true;
      setState("spinning-ready");
      setStatus("好きなタイミングでもう一度タップ", "☝");
      handlePromptText.textContent = "もう一度タップ";
      handlePromptSubtext.textContent = "止まると玉が出ます";
      garaponHandleButton.setAttribute("aria-label", "ガラポンのハンドルをもう一度タップして回転を止める");
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
      trackEvent("lottery_error", {
        error_message: lotteryApiError?.message || "unknown_error"
      });
      resetLotteryAnimation();
      nudgeStatus("通信に失敗しました。もう一度お試しください");
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
    pendingResult = null;
    lotteryRequestPromise = null;
    lotteryApiError = null;

    garaponDrum.getAnimations().forEach((animation) => animation.cancel());
    garaponHandleButton.getAnimations().forEach((animation) => animation.cancel());
    garaponDrum.style.transform = "";
    garaponHandleButton.style.transform = "";
    garaponHandleButton.disabled = false;
    garaponHandleButton.setAttribute("aria-label", "ガラポンのハンドルをタップして回転を始める");
    lotteryBall.className = "lottery-ball";
    interactiveGarapon.classList.remove("is-ejecting", "is-early-tap");
    handlePrompt.classList.remove("is-spinning", "is-ready");
    interactiveGarapon.classList.remove("is-starting", "is-stopping", "is-ejecting");
    handlePromptText.textContent = "ハンドルをタップ";
    handlePromptSubtext.textContent = "1回目で回転スタート";
    setStatus("ハンドルをタップしてください", "☾");
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
    resultTitle.textContent = isParticipation ? "参加賞おめでとう！🎁" : "おめでとうございます！✨";
    resultPrizeName.textContent = isParticipation ? "10pt" : result.title;
    resultPrizeName.hidden = false;
    resultPrizeHeading.hidden = false;
    resultPrizeName.classList.toggle("is-special", isSpecialPrize);
    resultMessage.textContent = isParticipation
      ? "残念…\n今回は景品は当たりませんでしたが、参加賞として10ptをプレゼント🎁"
      : result.message;
    resultCodeLabel.textContent = isParticipation ? "プレゼントコード" : "参加コード";
    resultCode.textContent = result.code || (isParticipation ? "KOIMATSURI" : "");
    resultGuide.textContent = isParticipation
      ? "アプリ内で入力してください。"
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
  }

  function updateEntryButtons(hasResult) {
    openButtons.forEach((button) => {
      button.textContent = hasResult ? "抽選結果を確認" : "抽選へ進む";
    });
  }

  function handleGaraponTap() {
    if (lotteryState === "idle") return beginSpin();
    if (lotteryState === "spinning-locked") return handleEarlyStopAttempt();
    if (lotteryState === "spinning-ready") stopSpin();
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
  startLotteryButton.addEventListener("click", openLotteryScreen);
  garaponHandleButton.addEventListener("click", handleGaraponTap);
  copyCodeButton.addEventListener("click", copyCode);
  document.querySelectorAll('a[href="https://app-clear.com/open?act=page_contact"]').forEach((link) => {
    link.addEventListener("click", () => trackEvent("contact_click", {
      prize_rank: resultView.classList.contains("is-participation") ? "" : resultRank.textContent.trim(),
      source: link.id === "resultContactButton" ? "result" : "guide"
    }));
  });
  participationClaimButton.addEventListener("click", () => trackEvent("participation_claim_click", {
    reward_point: 10,
    present_code: "KOIMATSURI"
  }));
  document.addEventListener("keydown", handleEscape);
  window.addEventListener("resize", updateMobileEntryBar);

  backToNews.addEventListener("click", (event) => {
    event.preventDefault();
    if (window.history.length > 1) window.history.back();
  });

  const storedResult = readStoredResult();
  updateEntryButtons(Boolean(storedResult));
  updateMobileEntryBar();

  if (storedResult) {
    window.setTimeout(() => openResultScreen(storedResult), 120);
  }
})();
