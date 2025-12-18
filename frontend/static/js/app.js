const API_BASE = location.origin.replace(/\/$/, "");

function $(sel) {
  return document.querySelector(sel);
}
function h(html) {
  const d = document.createElement("div");
  d.innerHTML = html;
  return d.firstElementChild;
}

let settingsSummarySelector = null;
let settingsSentimentSelector = null;
let settingsSentimentLoading = null;
let settingsModalPromise = null;

function ensureSettingsModalInjected() {
  if (document.querySelector("#settingsModal")) {
    return Promise.resolve(document.querySelector("#settingsModal"));
  }
  if (!settingsModalPromise) {
    settingsModalPromise = fetch("/static/components/settings_modal.html")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load settings modal (${response.status})`);
        }
        return response.text();
      })
      .then((html) => {
        const template = document.createElement("template");
        template.innerHTML = html.trim();
        const modal = template.content.querySelector("#settingsModal");
        if (!modal) {
          throw new Error("Settings modal markup missing #settingsModal");
        }
        document.body.appendChild(modal);
        return modal;
      })
      .catch((error) => {
        settingsModalPromise = null;
        throw error;
      });
  }
  return settingsModalPromise;
}

function cacheSettingsElementRefs() {
  if (!settingsSummarySelector) {
    settingsSummarySelector = document.querySelector(
      "#settingsSummarySelector"
    );
  }
  if (!settingsSentimentSelector) {
    settingsSentimentSelector = document.querySelector(
      "#settingsSentimentSelector"
    );
  }
  if (!settingsSentimentLoading) {
    settingsSentimentLoading = document.querySelector(
      "#settingsSentimentLoading"
    );
  }
}

const settingsModalReady = ensureSettingsModalInjected()
  .then((modal) => {
    cacheSettingsElementRefs();
    return modal;
  })
  .catch((error) => {
    console.error("Failed to initialize shared settings modal:", error);
    return null;
  });

const BODY_SCROLL_LOCK_CLASS = "modal-open";
let bodyScrollLockDepth = 0;

function lockBodyScroll() {
  if (bodyScrollLockDepth === 0) {
    document.body?.classList.add(BODY_SCROLL_LOCK_CLASS);
    document.documentElement?.classList.add(BODY_SCROLL_LOCK_CLASS);
  }
  bodyScrollLockDepth += 1;
}

function unlockBodyScroll(force = false) {
  if (force) {
    bodyScrollLockDepth = 0;
  } else if (bodyScrollLockDepth > 0) {
    bodyScrollLockDepth -= 1;
  }

  if (bodyScrollLockDepth === 0) {
    document.body?.classList.remove(BODY_SCROLL_LOCK_CLASS);
    document.documentElement?.classList.remove(BODY_SCROLL_LOCK_CLASS);
  }
}

// Theme switching functionality
function initializeThemeToggle() {
  // Checkbox switch (#themeSwitch) is the only supported control
  const checkboxToggle = $("#themeSwitch");

  // Get saved theme or default to dark, and apply immediately
  const savedTheme = localStorage.getItem("theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);

  // If checkbox exists, sync its checked state and wire change handler
  if (checkboxToggle) {
    checkboxToggle.checked = savedTheme === "light";

    checkboxToggle.addEventListener("change", () => {
      const newTheme = checkboxToggle.checked ? "light" : "dark";

      document.documentElement.classList.add("theme-switching");
      document.documentElement.setAttribute("data-theme", newTheme);
      localStorage.setItem("theme", newTheme);

      // Update charts/colors after paint, then remove switching class
      requestAnimationFrame(() => {
        updateChartsThemeColors();
        requestAnimationFrame(() => {
          document.documentElement.classList.remove("theme-switching");
        });
      });
    });
  }
}

// Helper function to add gradient to SVG (shared across pages)
function addGradientToSVG(svg, gradientId) {
  // Check if gradient already exists
  if (svg.querySelector(`#${gradientId}`)) {
    return;
  }

  // Create defs if it doesn't exist
  let defs = svg.querySelector("defs");
  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.insertBefore(defs, svg.firstChild);
  }

  // Create linearGradient with 135deg direction (top-left to bottom-right)
  const gradient = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "linearGradient"
  );
  gradient.setAttribute("id", gradientId);
  // 135deg = diagonal from top-left to bottom-right
  gradient.setAttribute("x1", "0%");
  gradient.setAttribute("y1", "0%");
  gradient.setAttribute("x2", "100%");
  gradient.setAttribute("y2", "100%");
  gradient.setAttribute("gradientUnits", "userSpaceOnUse");

  // Add gradient stops
  const stop1 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop1.setAttribute("offset", "0%");
  stop1.setAttribute("stop-color", "#3b82f6");
  gradient.appendChild(stop1);

  const stop2 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop2.setAttribute("offset", "50%");
  stop2.setAttribute("stop-color", "#06b6d4");
  gradient.appendChild(stop2);

  const stop3 = document.createElementNS("http://www.w3.org/2000/svg", "stop");
  stop3.setAttribute("offset", "100%");
  stop3.setAttribute("stop-color", "#10b981");
  gradient.appendChild(stop3);

  defs.appendChild(gradient);

  // Update the logo path to use the gradient
  const logoPath = svg.querySelector(".logo");
  if (logoPath) {
    logoPath.setAttribute("stroke", `url(#${gradientId})`);
  }
}

// Upload page
if (
  location.pathname.endsWith("/frontend/index.html") ||
  location.pathname === "/frontend/"
) {
  // Initialize theme toggle for upload page
  initializeThemeToggle();

  // Load logo loader from logo_loader.html
  async function loadLogoLoader() {
    try {
      const response = await fetch("/static/components/logo_loader.html");
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const loaderDiv = doc.querySelector(".loader");

      if (loaderDiv) {
        // Clone and inject into both loader containers
        const statusViewLoader = $("#statusViewLoader");
        const statusOverlayLoader = $("#statusOverlayLoader");

        if (statusViewLoader) {
          statusViewLoader.innerHTML = loaderDiv.outerHTML;
          // Update the class to match our CSS
          const loader = statusViewLoader.querySelector(".loader");
          if (loader) {
            loader.classList.add("logo-loader");
            // Add gradient definition to SVG
            const svg = loader.querySelector("svg");
            if (svg) {
              addGradientToSVG(svg, "logoGradient");
            }
          }
        }

        if (statusOverlayLoader) {
          statusOverlayLoader.innerHTML = loaderDiv.outerHTML;
          // Update the class to match our CSS
          const loader = statusOverlayLoader.querySelector(".loader");
          if (loader) {
            loader.classList.add("logo-loader");
            // Add gradient definition to SVG
            const svg = loader.querySelector("svg");
            if (svg) {
              addGradientToSVG(svg, "logoGradientOverlay");
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to load logo loader:", error);
      // Fallback to original spinner if loader fails to load
      const statusViewLoader = $("#statusViewLoader");
      const statusOverlayLoader = $("#statusOverlayLoader");
      if (statusViewLoader) {
        statusViewLoader.innerHTML = '<div class="loading-spinner"></div>';
      }
      if (statusOverlayLoader) {
        statusOverlayLoader.innerHTML = '<div class="loading-spinner"></div>';
      }
    }
  }

  // Load the logo loader when page loads
  loadLogoLoader();

  const fileInput = $("#fileInput");
  const dropzone = $("#dropzone");
  const previewModal = $("#previewModal");
  const closePreview = $("#closePreview");
  const cancelPreview = $("#cancelPreview");
  const confirmAnalysis = $("#confirmAnalysis");
  const modalAnalysisName = $("#modalAnalysisName");
  const modalTitle = $("#modalTitle");
  const previewView = $("#previewView");
  const statusView = $("#statusView");
  const statusTitle = $("#statusTitle");
  const statusMessage = $("#statusMessage");
  const statusProgressFill = $("#statusProgressFill");
  const statusProgressText = $("#statusProgressText");

  let currentFiles = null;

  // File parsing functions
  async function parseCSVFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          const lines = text.split("\n").filter((line) => line.trim());
          const comments = [];

          // Try to detect if first line is header
          const firstLine = lines[0].toLowerCase();
          const hasHeader =
            firstLine.includes("comment") ||
            firstLine.includes("text") ||
            firstLine.includes("feedback");
          const startIndex = hasHeader ? 1 : 0;

          for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
              // Handle CSV with quotes and commas
              const comment = line.replace(/^["']|["']$/g, "").trim();
              if (comment) {
                comments.push(comment);
              }
            }
          }
          resolve(comments);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  async function parseJSONFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const comments = [];

          // Handle different JSON structures
          if (Array.isArray(data)) {
            data.forEach((item) => {
              if (typeof item === "string") {
                comments.push(item);
              } else if (typeof item === "object" && item !== null) {
                // Look for common comment fields
                const comment =
                  item.comment ||
                  item.text ||
                  item.feedback ||
                  item.content ||
                  item.message;
                if (comment) {
                  comments.push(comment);
                }
              }
            });
          } else if (typeof data === "object" && data !== null) {
            // Handle object with array of comments
            const commentArray = data.comments || data.data || data.items || [];
            commentArray.forEach((item) => {
              if (typeof item === "string") {
                comments.push(item);
              } else if (typeof item === "object" && item !== null) {
                const comment =
                  item.comment ||
                  item.text ||
                  item.feedback ||
                  item.content ||
                  item.message;
                if (comment) {
                  comments.push(comment);
                }
              }
            });
          }
          resolve(comments);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  async function parseTXTFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const text = e.target.result;
          // Split by common delimiters
          const comments = text
            .split(/[\n\r]+/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);
          resolve(comments);
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsText(file);
    });
  }

  async function parseFile(file) {
    const extension = file.name.toLowerCase().split(".").pop();
    switch (extension) {
      case "csv":
        return await parseCSVFile(file);
      case "json":
        return await parseJSONFile(file);
      case "txt":
        return await parseTXTFile(file);
      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }
  }

  function showPreviewModal(files, comments) {
    const fileArray = Array.from(files || []);
    const fileNames = fileArray.map((f) => f.name).join(", ");
    const totalCount = comments.length;
    const sampleCount = Math.min(10, totalCount);
    const sampleComments = comments.slice(0, sampleCount);

    // Update modal content
    $("#previewFileName").textContent = fileNames || "No file selected";
    $("#previewTotalCount").textContent = totalCount.toLocaleString();

    // Toggle "more comments below" indicator based on whether
    // there are more comments than the sampled ones
    const moreIndicator = previewModal.querySelector(
      ".preview-overlay .preview-more-indicator"
    );
    if (moreIndicator && moreIndicator.parentElement) {
      if (totalCount > sampleCount) {
        moreIndicator.parentElement.style.display = "block";
      } else {
        moreIndicator.parentElement.style.display = "none";
      }
    }

    // Sync values from main form to modal
    modalAnalysisName.value = "";
    // Apply saved settings into defaults
    cacheSettingsElementRefs();
    const savedSummary = localStorage.getItem("summary_model") || "ollama";
    const savedSentiment = localStorage.getItem("sentiment_model") || "roberta";
    if (settingsSummarySelector) settingsSummarySelector.value = savedSummary;
    if (settingsSentimentSelector)
      settingsSentimentSelector.value = savedSentiment;

    // Populate table
    const tbody = $("#previewTableBody");
    tbody.innerHTML = "";

    sampleComments.forEach((comment, index) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${index + 1}</td>
        <td>${
          comment.length > 200 ? comment.substring(0, 200) + "..." : comment
        }</td>
      `;
      tbody.appendChild(row);
    });

    // Show modal
    previewModal.style.display = "flex";
    // Lock background scroll while modal is open
    lockBodyScroll();
  }

  function hidePreviewModal() {
    previewModal.style.display = "none";
    // Restore background scroll when modal closes
    unlockBodyScroll();
    currentFiles = null;
    // Ensure re-selecting the same file triggers change
    try {
      if (fileInput) fileInput.value = "";
    } catch (_) {}
    showPreviewView();
  }

  function showPreviewView() {
    modalTitle.textContent = "File Preview";
    previewView.style.display = "block";
    statusView.style.display = "none";
    closePreview.style.display = "block";
    cancelPreview.style.display = "block";
    confirmAnalysis.style.display = "block";
  }

  function showStatusView() {
    // Hide the modal entirely and show full-page status overlay
    try {
      previewModal.style.display = "none";
      unlockBodyScroll();
    } catch (_e) {}
    const overlay = document.getElementById("statusOverlay");
    if (overlay) {
      overlay.style.display = "flex";
      lockBodyScroll();
    }
  }

  function updateStatus(title, message, progress = 0) {
    statusTitle.textContent = title;
    statusMessage.textContent = message;
    statusProgressFill.style.width = `${progress}%`;
    statusProgressText.textContent = `${Math.round(progress)}%`;
    // Mirror into overlay when present
    const ovTitle = document.getElementById("ovStatusTitle");
    const ovMsg = document.getElementById("ovStatusMessage");
    const ovFill = document.getElementById("ovStatusProgressFill");
    const ovText = document.getElementById("ovStatusProgressText");
    if (ovTitle) ovTitle.textContent = title;
    if (ovMsg) ovMsg.textContent = message;
    if (ovFill) ovFill.style.width = `${progress}%`;
    if (ovText) ovText.textContent = `${Math.round(progress)}%`;
  }

  // Load sentiment model on demand
  async function loadSentimentModel(modelType) {
    cacheSettingsElementRefs();
    try {
      // Show loading overlay
      // Show loading on whichever overlay exists (settings or preview)
      if (settingsSentimentLoading)
        settingsSentimentLoading.style.display = "flex";
      if (settingsSentimentSelector) settingsSentimentSelector.disabled = true;
      if (typeof sentimentModelLoading !== "undefined" && sentimentModelLoading)
        sentimentModelLoading.style.display = "flex";
      if (
        typeof modalSentimentSelector !== "undefined" &&
        modalSentimentSelector
      )
        modalSentimentSelector.disabled = true;

      // Check if model is already loaded
      const statusResponse = await fetch(
        API_BASE + "/admin/sentiment_models_status"
      );
      const status = await statusResponse.json();

      if (status.loaded_models.includes(modelType)) {
        // Model already loaded
        if (settingsSentimentLoading)
          settingsSentimentLoading.style.display = "none";
        if (settingsSentimentSelector)
          settingsSentimentSelector.disabled = false;
        if (
          typeof sentimentModelLoading !== "undefined" &&
          sentimentModelLoading
        )
          sentimentModelLoading.style.display = "none";
        if (
          typeof modalSentimentSelector !== "undefined" &&
          modalSentimentSelector
        )
          modalSentimentSelector.disabled = false;
        return;
      }

      // Load the model
      const formData = new FormData();
      formData.append("model_type", modelType);

      const response = await fetch(API_BASE + "/admin/load_sentiment_model", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (result.ok) {
        console.log(`✓ Sentiment model ${modelType} loaded successfully`);
      } else {
        console.error(
          `✗ Failed to load sentiment model ${modelType}:`,
          result.message
        );
      }
    } catch (error) {
      console.error("✗ Error loading sentiment model:", error);
    } finally {
      // Hide loading overlay
      if (settingsSentimentLoading)
        settingsSentimentLoading.style.display = "none";
      if (settingsSentimentSelector) settingsSentimentSelector.disabled = false;
      if (typeof sentimentModelLoading !== "undefined" && sentimentModelLoading)
        sentimentModelLoading.style.display = "none";
      if (
        typeof modalSentimentSelector !== "undefined" &&
        modalSentimentSelector
      )
        modalSentimentSelector.disabled = false;
    }
  }
  dropzone.addEventListener("click", (e) => {
    // Only trigger file input if the click wasn't on the file input itself
    if (e.target !== fileInput) {
      // Clear value so selecting the same file fires a change event
      try {
        if (fileInput) fileInput.value = "";
      } catch (_) {}
      fileInput.click();
    }
  });
  fileInput.addEventListener("change", async (e) => {
    if (e.target.files.length > 0) {
      currentFiles = e.target.files;
      try {
        // Parse all selected files to build a combined preview
        let allComments = [];
        for (const file of currentFiles) {
          const comments = await parseFile(file);
          allComments = allComments.concat(comments);
        }
        showPreviewModal(currentFiles, allComments);
      } catch (error) {
        console.error("Error parsing file(s):", error.message);
        alert("Error parsing file(s): " + error.message);
        // Reset to allow retrying same file selection after an error
        try {
          if (fileInput) fileInput.value = "";
        } catch (_) {}
      }
    }
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("hover");
  });
  dropzone.addEventListener("dragleave", () =>
    dropzone.classList.remove("hover")
  );
  dropzone.addEventListener("drop", async (e) => {
    e.preventDefault();
    fileInput.files = e.dataTransfer.files;
    currentFiles = e.dataTransfer.files;

    if (e.dataTransfer.files.length > 0) {
      try {
        // Parse all dropped files to build a combined preview
        let allComments = [];
        for (const file of currentFiles) {
          const comments = await parseFile(file);
          allComments = allComments.concat(comments);
        }
        showPreviewModal(currentFiles, allComments);
      } catch (error) {
        console.error("Error parsing file(s):", error.message);
        alert("Error parsing file(s): " + error.message);
      }
    }
  });

  // Modal event handlers
  closePreview.addEventListener("click", hidePreviewModal);
  cancelPreview.addEventListener("click", hidePreviewModal);

  // (Removed page-scoped settings wiring; use global initializer instead)

  // Close modal when clicking outside
  previewModal.addEventListener("click", (e) => {
    if (e.target === previewModal) {
      hidePreviewModal();
    }
  });

  // Confirm analysis button
  confirmAnalysis.addEventListener("click", async () => {
    if (!currentFiles || currentFiles.length === 0) {
      console.error("No files selected");
      return;
    }

    // Switch to full-page status overlay
    showStatusView();
    updateStatus(
      "Uploading and analyzing...",
      "Please wait while we process your data",
      10
    );

    const fd = new FormData();
    for (const f of currentFiles) {
      fd.append("files", f);
    }
    if (modalAnalysisName.value) fd.append("name", modalAnalysisName.value);
    // Use settings selections for models
    cacheSettingsElementRefs();
    const selectedSummary =
      (settingsSummarySelector && settingsSummarySelector.value) ||
      localStorage.getItem("summary_model") ||
      "ollama";
    const selectedSentiment =
      (settingsSentimentSelector && settingsSentimentSelector.value) ||
      localStorage.getItem("sentiment_model") ||
      "roberta";
    fd.append("model_type", selectedSummary);
    fd.append("sentiment_model", selectedSentiment);

    try {
      const res = await fetch(API_BASE + "/analyses/upload", {
        method: "POST",
        body: fd,
      });

      if (!res.ok) throw new Error(await res.text());

      const data = await res.json();

      updateStatus(
        "Sentiment done, generating summaries & wordcloud...",
        "Please wait while we process your data",
        80
      );

      const aid = data.analysis.id;
      localStorage.setItem("lastAnalysisId", aid);

      updateStatus(
        "Initial Analysis Complete!",
        "Redirecting to dashboard - summaries are still being generated...",
        100
      );

      setTimeout(() => {
        // Keep overlay visible during navigation to avoid background flash
        location.href =
          "/frontend/dashboard.html?analysis_id=" + encodeURIComponent(aid);
      }, 1000);
    } catch (err) {
      updateStatus("Error occurred", err.message, 0);
      console.error("Analysis error:", err);
      const overlay = document.getElementById("statusOverlay");
      if (overlay) overlay.style.display = "none";
      unlockBodyScroll();
    }
  });
}

// In-memory wordcloud cache to prevent repeated API calls
const wordcloudCache = new Map();

// Clear wordcloud cache to prevent memory leaks
function clearWordcloudMemoryCache() {
  wordcloudCache.clear();
  console.log("Cleared wordcloud memory cache");
}

// Clear wordcloud cache from localStorage to free up space
function clearWordcloudCache() {
  try {
    const keys = Object.keys(localStorage);
    const wordcloudKeys = keys.filter((key) => key.startsWith("wordcloud_"));
    wordcloudKeys.forEach((key) => localStorage.removeItem(key));
    console.log(`Cleared ${wordcloudKeys.length} wordcloud cache entries`);
  } catch (error) {
    console.warn("Error clearing wordcloud cache:", error);
  }
}

const LOGO_LOADER_URL = "/static/components/logo_loader.html";
let cachedLogoLoaderHTML = null;
const SPINNER_FALLBACK_HTML = `
  <div class="loading-spinner">
    <div class="spinner-ring"></div>
    <div class="spinner-ring"></div>
    <div class="spinner-ring"></div>
  </div>
`;

async function injectLogoLoader(targetElement, gradientId) {
  if (!targetElement) return false;
  try {
    if (!cachedLogoLoaderHTML) {
      const response = await fetch(LOGO_LOADER_URL);
      cachedLogoLoaderHTML = await response.text();
    }
    const parser = new DOMParser();
    const doc = parser.parseFromString(cachedLogoLoaderHTML, "text/html");
    const loaderDiv = doc.querySelector(".loader");
    if (loaderDiv) {
      targetElement.innerHTML = loaderDiv.outerHTML;
      const loader = targetElement.querySelector(".loader");
      if (loader) {
        loader.classList.add("logo-loader");
        const svg = loader.querySelector("svg");
        if (svg) {
          addGradientToSVG(svg, gradientId || "logoGradientGeneric");
        }
      }
      return true;
    }
  } catch (error) {
    console.error("Failed to load logo loader:", error);
  }
  targetElement.innerHTML = SPINNER_FALLBACK_HTML;
  return false;
}

// Dashboard page
if (location.pathname.endsWith("/frontend/dashboard.html")) {
  // Initialize theme toggle for dashboard
  initializeThemeToggle();

  // Clear wordcloud cache on page load to prevent quota issues
  clearWordcloudCache();
  clearWordcloudMemoryCache();
  const url = new URL(location.href);
  const analysisId =
    url.searchParams.get("analysis_id") ||
    localStorage.getItem("lastAnalysisId");
  const commentsContainer = $("#commentsContainer");
  const progressHeaderContainer = $("#progressHeaderContainer");
  const modelTagsContainer = $("#modelTagsContainer");
  const filterSentiment = $("#filterSentiment");
  const filterKeyword = $("#filterKeyword");
  const keywordFilterToggle = $("#keywordFilterToggle");
  const keywordFilterPanel = $("#keywordFilterPanel");
  const keywordFilterClose = $("#keywordFilterClose");
  const downloadCsv = $("#downloadCsv");
  const downloadPdf = $("#downloadPdf");
  const exportBtn = document.getElementById("exportBtn");
  const exportMenu = document.getElementById("exportMenu");
  const chartTypeSelector = $("#chartType");
  let allComments = [];
  let counts = { positive: 0, neutral: 0, negative: 0 };
  let chart;
  let chart3D;
  let chartBar2D;
  let chartBar3D;
  let chartCreated = false;
  let currentChartType = localStorage.getItem("chartType") || "2d";

  // Set the saved chart type on page load
  if (chartTypeSelector) {
    chartTypeSelector.value = currentChartType;
  }
  let pollId = null;
  let analysisMeta = {};
  let analysisStatus = "";
  let analysis = null;
  let currentProgress = 0;
  let targetProgress = 0;
  let progressAnimationId = null;
  let pdfDownloadInFlight = false;
  const PDF_MODAL_ID = "pdfGenerationOverlay";
  let pdfModalRefs = null;
  let pdfModalCurrentProgress = 0;
  let pdfModalTargetProgress = 0;
  let pdfModalProgressRAF = null;
  let pdfModalFallbackTimer = null;
  let pdfModalDataStarted = false;
  let pdfModalScrollLocked = false;

  function ensurePdfModal() {
    if (pdfModalRefs) return pdfModalRefs;
    const template = `
      <div class="pdf-modal-backdrop" id="${PDF_MODAL_ID}">
        <div class="pdf-modal">
          <div class="pdf-logo-loader logo-loader-container"></div>
          <h3>Preparing PDF export</h3>
          <p class="pdf-modal-status">Initializing…</p>
          <div class="pdf-progress-track">
            <div class="pdf-progress-fill"></div>
          </div>
          <div class="pdf-progress-meta">
            <span>Progress</span>
            <span class="pdf-progress-percent">0%</span>
          </div>
          <button type="button" class="pdf-modal-dismiss">Dismiss</button>
        </div>
      </div>`;
    document.body.insertAdjacentHTML("beforeend", template);
    const overlay = document.getElementById(PDF_MODAL_ID);
    pdfModalRefs = {
      overlay,
      loader: overlay.querySelector(".pdf-logo-loader"),
      status: overlay.querySelector(".pdf-modal-status"),
      percent: overlay.querySelector(".pdf-progress-percent"),
      fill: overlay.querySelector(".pdf-progress-fill"),
      dismiss: overlay.querySelector(".pdf-modal-dismiss"),
    };
    pdfModalRefs.dismiss.addEventListener("click", hidePdfModal);
    injectLogoLoader(pdfModalRefs.loader, "logoGradientPdf");
    return pdfModalRefs;
  }

  function showPdfModal(statusText) {
    const refs = ensurePdfModal();
    refs.overlay.classList.add("is-visible");
    refs.dismiss.classList.remove("is-visible");
    pdfModalCurrentProgress = 0;
    pdfModalTargetProgress = 0;
    if (pdfModalProgressRAF) {
      cancelAnimationFrame(pdfModalProgressRAF);
      pdfModalProgressRAF = null;
    }
    stopPdfWarmupProgress();
    pdfModalDataStarted = false;
    refs.fill.classList.add("no-transition");
    refs.fill.style.width = "0%";
    refs.percent.textContent = "0%";
    requestAnimationFrame(() => {
      refs.fill.classList.remove("no-transition");
    });
    setPdfModalProgress(1);
    setPdfModalStatus(statusText || "Preparing export…");
    if (!pdfModalScrollLocked) {
      lockBodyScroll();
      pdfModalScrollLocked = true;
    }
  }

  function hidePdfModal() {
    if (!pdfModalRefs) return;
    pdfModalRefs.overlay.classList.remove("is-visible");
    if (pdfModalProgressRAF) {
      cancelAnimationFrame(pdfModalProgressRAF);
      pdfModalProgressRAF = null;
    }
    stopPdfWarmupProgress();
    if (pdfModalScrollLocked) {
      unlockBodyScroll();
      pdfModalScrollLocked = false;
    }
  }

  function setPdfModalStatus(text) {
    const refs = ensurePdfModal();
    refs.status.textContent = text;
  }

  function setPdfModalProgress(percent) {
    const refs = ensurePdfModal();
    pdfModalTargetProgress = Math.max(0, Math.min(100, Number(percent)));

    function step() {
      const diff = pdfModalTargetProgress - pdfModalCurrentProgress;
      if (Math.abs(diff) < 0.5) {
        pdfModalCurrentProgress = pdfModalTargetProgress;
        refs.fill.style.width = `${pdfModalCurrentProgress}%`;
        refs.percent.textContent = `${Math.round(pdfModalCurrentProgress)}%`;
        pdfModalProgressRAF = null;
        return;
      }
      const easing = Math.max(0.5, Math.abs(diff) * 0.2);
      pdfModalCurrentProgress += diff > 0 ? easing : -easing;
      pdfModalCurrentProgress = Math.max(
        0,
        Math.min(100, pdfModalCurrentProgress)
      );
      refs.fill.style.width = `${pdfModalCurrentProgress}%`;
      refs.percent.textContent = `${Math.round(pdfModalCurrentProgress)}%`;
      pdfModalProgressRAF = requestAnimationFrame(step);
    }

    if (!pdfModalProgressRAF) {
      pdfModalProgressRAF = requestAnimationFrame(step);
    }
  }

  function startPdfWarmupProgress() {
    stopPdfWarmupProgress();
    pdfModalFallbackTimer = setInterval(() => {
      if (pdfModalDataStarted) {
        stopPdfWarmupProgress();
        return;
      }
      const nextTarget = Math.min(25, pdfModalTargetProgress + 2);
      setPdfModalProgress(nextTarget);
      setPdfModalStatus("Preparing export…");
    }, 350);
  }

  function stopPdfWarmupProgress() {
    if (pdfModalFallbackTimer) {
      clearInterval(pdfModalFallbackTimer);
      pdfModalFallbackTimer = null;
    }
  }

  function showPdfModalError(message) {
    const refs = ensurePdfModal();
    refs.overlay.classList.add("is-visible");
    refs.dismiss.classList.add("is-visible");
    setPdfModalProgress(0);
    setPdfModalStatus(message);
    if (!pdfModalScrollLocked) {
      lockBodyScroll();
      pdfModalScrollLocked = true;
    }
  }

  function buildPdfFilename() {
    const base =
      (analysis && analysis.name) ||
      (analysisId ? `analysis_${analysisId}` : "analysis_report");
    const normalized = base
      .toString()
      .trim()
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase();
    return `${normalized || "analysis_report"}.pdf`;
  }

  async function downloadPdfWithProgress(url, filename) {
    showPdfModal("Preparing export…");
    setPdfModalProgress(1);
    startPdfWarmupProgress();
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/pdf" },
      });
      if (!response.ok) {
        throw new Error(`Unable to generate PDF (status ${response.status})`);
      }

      const contentLength = Number(response.headers.get("content-length") || 0);
      if (!response.body || !response.body.getReader) {
        pdfModalDataStarted = true;
        stopPdfWarmupProgress();
        setPdfModalStatus("Generating report…");
        setPdfModalProgress(40);
        const blob = await response.blob();
        setPdfModalProgress(80);
        setPdfModalStatus("Finalizing download…");
        triggerPdfDownload(blob, filename);
        setPdfModalProgress(100);
        setPdfModalStatus("Download ready.");
        setTimeout(() => hidePdfModal(), 900);
        return;
      }

      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      let fallbackProgress = 12;
      setPdfModalStatus("Generating report…");

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) {
          if (!pdfModalDataStarted) {
            pdfModalDataStarted = true;
            stopPdfWarmupProgress();
          }
          chunks.push(value);
          received += value.length;
          if (contentLength > 0) {
            const percent = Math.min(
              98,
              Math.round((received / contentLength) * 100)
            );
            setPdfModalProgress(percent);
            setPdfModalStatus(`Generating report… ${percent}%`);
          } else {
            fallbackProgress = Math.min(95, fallbackProgress + 3);
            setPdfModalProgress(fallbackProgress);
            setPdfModalStatus(`Generating report… ${fallbackProgress}%`);
          }
        }
      }

      setPdfModalStatus("Finalizing download…");
      const blob = new Blob(chunks, { type: "application/pdf" });
      triggerPdfDownload(blob, filename);
      setPdfModalProgress(100);
      setPdfModalStatus("Download ready.");
      setTimeout(() => hidePdfModal(), 900);
    } catch (error) {
      console.error("PDF download failed:", error);
      showPdfModalError(
        error?.message || "Failed to generate PDF. Please try again."
      );
      throw error;
    }
  }

  function triggerPdfDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      link.remove();
    }, 0);
  }

  // Update sentiment filter based on model
  function updateSentimentFilter() {
    if (!analysis || !filterSentiment) return;

    const sentimentModel = (analysis.sentiment_model || "").toLowerCase();
    const isBinarySentiment = sentimentModel.includes("distilbert");

    // Clear existing options
    filterSentiment.innerHTML = '<option value="">All sentiments</option>';

    if (isBinarySentiment) {
      // 2-class: Only positive and negative
      filterSentiment.innerHTML += '<option value="positive">Positive</option>';
      filterSentiment.innerHTML += '<option value="negative">Negative</option>';
    } else {
      // 3-class: Positive, neutral, negative
      filterSentiment.innerHTML += '<option value="positive">Positive</option>';
      filterSentiment.innerHTML += '<option value="neutral">Neutral</option>';
      filterSentiment.innerHTML += '<option value="negative">Negative</option>';
    }

    // Update custom select menu if it exists
    const customSelectWrapper = filterSentiment.closest(".cs");
    if (customSelectWrapper) {
      const menu = customSelectWrapper.querySelector(".cs-menu");
      const trigger = customSelectWrapper.querySelector(".cs-trigger");
      const valueSpan = customSelectWrapper.querySelector(".cs-value");
      const iconTrigger = filterSentiment.dataset.iconTrigger === "true";

      if (menu) {
        // Clear existing menu items
        menu.innerHTML = "";

        // Rebuild menu from updated native select options
        const optionsList = Array.from(filterSentiment.options);
        optionsList.forEach((opt, index) => {
          const item = document.createElement("div");
          item.className = "cs-option";
          item.setAttribute("role", "option");
          const iconPath = opt.dataset.icon;
          if (iconPath) {
            const optionIcon = document.createElement("span");
            optionIcon.className = "cs-option-icon";
            optionIcon.style.setProperty(
              "--cs-icon-image",
              `url("${iconPath}")`
            );
            item.appendChild(optionIcon);
          }
          const optionLabel = document.createElement("span");
          optionLabel.className = "cs-option-label";
          optionLabel.textContent = opt.text;
          item.appendChild(optionLabel);
          if (opt.disabled) item.setAttribute("aria-disabled", "true");
          if (opt.selected) item.setAttribute("aria-selected", "true");
          item.addEventListener("click", () => {
            if (opt.disabled) return;
            filterSentiment.value = opt.value;
            filterSentiment.selectedIndex = index;

            // Update trigger display
            const resolvedLabel = (opt?.text || "").trim() || "All sentiments";
            if (iconTrigger && valueSpan) {
              const iconSpan = valueSpan.querySelector(".cs-value-icon");
              const srText = valueSpan.querySelector(".sr-only");
              if (iconSpan) {
                const iconPath = opt?.dataset.icon;
                if (iconPath) {
                  iconSpan.style.setProperty(
                    "--cs-icon-image",
                    `url("${iconPath}")`
                  );
                  iconSpan.classList.remove("cs-value-icon--empty");
                  iconSpan.textContent = "";
                } else {
                  iconSpan.style.removeProperty("--cs-icon-image");
                  iconSpan.classList.add("cs-value-icon--empty");
                  const fallbackChar =
                    resolvedLabel.charAt(0).toUpperCase() || "•";
                  iconSpan.textContent = fallbackChar;
                }
              }
              if (srText) srText.textContent = resolvedLabel;
            } else if (valueSpan) {
              valueSpan.textContent = resolvedLabel;
            }
            if (trigger) trigger.setAttribute("aria-label", resolvedLabel);

            // Update menu selection
            menu
              .querySelectorAll(".cs-option")
              .forEach((el) => el.removeAttribute("aria-selected"));
            item.setAttribute("aria-selected", "true");

            // Fire change event
            filterSentiment.dispatchEvent(
              new Event("change", { bubbles: true })
            );
            customSelectWrapper.setAttribute("aria-expanded", "false");
          });
          menu.appendChild(item);
        });
      }
    }
  }

  // Smooth progress animation function
  function animateProgress(targetPercent) {
    targetProgress = targetPercent;

    if (progressAnimationId) {
      cancelAnimationFrame(progressAnimationId);
    }

    function updateProgress() {
      const diff = targetProgress - currentProgress;
      if (Math.abs(diff) < 0.1) {
        currentProgress = targetProgress;
      } else {
        // Use smooth easing for natural animation
        const easingFactor = 0.12; // Faster for more responsive feel
        currentProgress += diff * easingFactor;
      }

      // Update both progress bar and percentage together in the same frame
      const progressFill = document.querySelector(".progress-fill");
      const progressPercentage = document.querySelector(".progress-percentage");

      if (progressFill && progressPercentage) {
        // Update both elements with the same value in the same frame
        const roundedProgress = Math.round(currentProgress);
        progressFill.style.width = `${currentProgress}%`;
        progressPercentage.textContent = `${roundedProgress}%`;

        // Add visual feedback for both progress bar and percentage updates
        if (Math.abs(diff) >= 1.0) {
          progressFill.classList.add("updating");
          progressPercentage.classList.add("updating");
          setTimeout(() => {
            progressFill.classList.remove("updating");
            progressPercentage.classList.remove("updating");
          }, 150);
        }
      }

      if (Math.abs(diff) >= 0.1) {
        progressAnimationId = requestAnimationFrame(updateProgress);
      }
    }

    updateProgress();
  }

  async function load() {
    if (!analysisId) {
      commentsContainer.innerHTML = "<p>No analysis selected.</p>";
      return;
    }
    const res = await fetch(API_BASE + "/analyses/" + analysisId);
    const data = await res.json();
    allComments = data.comments;
    const newCounts = data.analysis.sentiment_counts || counts;
    const countsChanged = JSON.stringify(counts) !== JSON.stringify(newCounts);
    counts = newCounts;
    analysisStatus = data.analysis.status || "";
    analysisMeta = (data.analysis && data.analysis.meta) || {};
    analysis = data.analysis;

    // Update sentiment filter based on model
    updateSentimentFilter();

    // If backend surfaced a summarizer error, show a single toast (bottom-right) with truncation and auto-dismiss
    if (analysisMeta && analysisMeta.summarizer_error) {
      // Ensure a single global toast container exists
      let toastContainer = document.querySelector(".toast-container");
      if (!toastContainer) {
        toastContainer = h('<div class="toast-container"></div>');
        document.body.appendChild(toastContainer);
      }

      // Reuse existing summarizer toast if present
      let toast = toastContainer.querySelector(
        '.toast.toast-error[data-toast="summarizer"]'
      );
      if (!toast) {
        toast = h(
          `<div class="toast toast-error" data-toast="summarizer">
            <div class="toast-icon">!</div>
            <div class="toast-content">
              <div class="toast-title">Summarizer error</div>
              <div class="toast-message truncated"></div>
            </div>
            <div class="toast-actions">
              <button class="toast-btn toast-expand" title="Show full">↗</button>
              <button class="toast-btn toast-close" aria-label="Dismiss">✕</button>
            </div>
          </div>`
        );
        toastContainer.appendChild(toast);

        // Wire up buttons
        const closeBtn = toast.querySelector(".toast-close");
        if (closeBtn)
          closeBtn.addEventListener("click", () => dismissToast(toast));
        const expandBtn = toast.querySelector(".toast-expand");
        if (expandBtn)
          expandBtn.addEventListener("click", () => {
            const msg = toast.querySelector(".toast-message");
            if (!msg) return;
            const isTrunc = msg.classList.contains("truncated");
            if (isTrunc) {
              msg.classList.remove("truncated");
              expandBtn.textContent = "↙";
              expandBtn.title = "Show less";
            } else {
              msg.classList.add("truncated");
              expandBtn.textContent = "↗";
              expandBtn.title = "Show full";
            }
          });
      }

      const msgEl = toast.querySelector(".toast-message");
      if (msgEl) {
        msgEl.textContent = analysisMeta.summarizer_error;
        // Ensure truncated by default for long text
        msgEl.classList.add("truncated");
        // Reset expand button to collapsed state when new message arrives
        const expandBtn = toast.querySelector(".toast-expand");
        if (expandBtn) {
          expandBtn.textContent = "↗";
          expandBtn.title = "Show full";
        }
      }

      // Reset auto-dismiss timer (6s)
      resetToastTimer(toast, 6000);
    } else {
      // No current error: dismiss any existing summarizer error toast to avoid stale notifications
      const toastContainer = document.querySelector(".toast-container");
      if (toastContainer) {
        const existing = toastContainer.querySelector(
          '.toast.toast-error[data-toast="summarizer"]'
        );
        if (existing) dismissToast(existing);
      }
    }
    drawComments();
    if (countsChanged || !chartCreated) {
      // Small delay to ensure DOM is ready
      setTimeout(() => {
        drawChart();
      }, 100);
    }
    downloadCsv.href = API_BASE + "/analyses/" + analysisId + "/export.csv";
    downloadPdf.href = API_BASE + "/analyses/" + analysisId + "/export.pdf";

    // Clear any existing wordcloud cache to free up localStorage space
    clearWordcloudCache();

    // Generate wordcloud with in-memory caching
    generateWordCloudWithCache(analysisId);
    // Only stop polling if analysis is done AND no summaries are pending
    const hasPending = data.comments.some(
      (c) => c.summary_status === "pending"
    );

    if (data.analysis.status === "done" && !hasPending && pollId) {
      clearInterval(pollId);
      pollId = null;
    }
    // If all rows have summaries or errors and no pending left, remove any prior error banner if empty
    if (!data.comments.some((c) => c.summary_status === "pending")) {
      const banners = document.querySelectorAll(".card");
      // leave other cards; only remove summarizer-error banner if error message missing
      // no-op for simplicity
    }
  }

  function drawChart() {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    const chartPositive = styles.getPropertyValue("--chart-positive").trim();
    const chartNeutral = styles.getPropertyValue("--chart-neutral").trim();
    const chartNegative = styles.getPropertyValue("--chart-negative").trim();
    const chartAxisLabel = styles.getPropertyValue("--chart-axis-label").trim();
    const chartGrid = styles.getPropertyValue("--chart-grid").trim();
    // Check if we're using 2-class or 3-class sentiment analysis
    const sentimentModel = (analysis?.sentiment_model || "").toLowerCase();
    const isBinarySentiment = sentimentModel.includes("distilbert");

    const labels = isBinarySentiment
      ? ["Positive", "Negative"]
      : ["Positive", "Neutral", "Negative"];

    const newData = isBinarySentiment
      ? [counts.positive || 0, counts.negative || 0]
      : [counts.positive || 0, counts.neutral || 0, counts.negative || 0];

    const colors = isBinarySentiment
      ? [chartPositive, chartNegative]
      : [chartPositive, chartNeutral, chartNegative];

    const chartEntries = labels.map((label, index) => ({
      label,
      category: label,
      value: newData[index],
      color: colors[index] || chartPositive,
    }));

    const selectedChartType = chartTypeSelector
      ? chartTypeSelector.value
      : "2d";

    // Get chart containers
    const canvas2D = $("#sentimentChart");
    const container3D = $("#sentimentChart3D");

    // COMPLETELY DESTROY ALL EXISTING CHARTS FIRST
    if (chart) {
      chart.destroy();
      chart = null;
    }
    if (chartBar2D) {
      chartBar2D.destroy();
      chartBar2D = null;
    }
    if (chart3D) {
      chart3D.dispose();
      chart3D = null;
    }
    if (chartBar3D) {
      chartBar3D.dispose();
      chartBar3D = null;
    }

    // HIDE ALL CONTAINERS COMPLETELY
    canvas2D.style.display = "none";
    canvas2D.style.visibility = "hidden";
    container3D.style.display = "none";
    container3D.style.visibility = "hidden";

    // CLEAR ALL CONTAINERS
    container3D.innerHTML = "";
    const ctx = canvas2D.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, canvas2D.width, canvas2D.height);
    }

    if (selectedChartType === "3d") {
      container3D.style.display = "block";
      container3D.style.visibility = "visible";

      // ENSURE CANVAS IS COMPLETELY HIDDEN
      canvas2D.style.display = "none";
      canvas2D.style.visibility = "hidden";

      // CREATE FRESH 3D CHART EVERY TIME
      const chartData = chartEntries.map(({ label, value }) => ({
        x: label,
        value,
      }));
      chart3D = anychart.pie3d(chartData);
      try {
        chart3D.animation(false);
      } catch (e) {}

      // Configure chart
      chart3D.title(false);
      chart3D.background("transparent");
      // Use a distinct palette instance so we can update later
      try {
        const pal = anychart.palettes.distinctColors();
        pal.items(colors);
        chart3D.palette(pal);
      } catch (e) {
        chart3D.palette(colors);
      }
      chart3D.tooltip().format("{%x}: {%value} ({%percentOfTotal}%)");
      chart3D
        .legend()
        .enabled(true)
        .position("bottom")
        .itemsLayout("horizontal")
        .fontSize(12)
        .fontColor("#334155");
      chart3D.labels().enabled(false);

      // Set container and draw
      chart3D.container(container3D);
      chart3D.draw();
    } else if (selectedChartType === "bar2d") {
      canvas2D.style.display = "block";
      canvas2D.style.visibility = "visible";

      // Create or update 2D bar chart using Chart.js
      if (chartBar2D) {
        chartBar2D.data.labels = labels;
        chartBar2D.data.datasets[0].data = newData;
        chartBar2D.data.datasets[0].backgroundColor = colors;
        chartBar2D.update("none");
      } else {
        chartBar2D = new Chart(canvas2D, {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              {
                data: newData,
                backgroundColor: colors,
                borderColor: "#ffffff",
                borderWidth: 2,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                display: false,
              },
              tooltip: {
                backgroundColor: "rgba(15,23,42,0.9)",
                padding: 10,
                titleColor: "#e2e8f0",
                bodyColor: "#e2e8f0",
              },
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: {
                  color: "#334155",
                },
                grid: {
                  color: "rgba(148, 163, 184, 0.2)",
                },
              },
              x: {
                ticks: {
                  color: "#334155",
                },
                grid: {
                  color: "rgba(148, 163, 184, 0.2)",
                },
              },
            },
          },
        });
      }
    } else if (selectedChartType === "bar3d") {
      container3D.style.display = "block";
      container3D.style.visibility = "visible";

      // Create or update 3D bar chart using AmCharts
      if (!chartBar3D) {
        container3D.innerHTML = "";

        // Disable amCharts animations/theme to avoid stutter on redraw/theme switch
        try {
          am4core.unuseAllThemes && am4core.unuseAllThemes();
        } catch (e) {}

        // Create chart instance
        chartBar3D = am4core.create(container3D, am4charts.XYChart3D);

        // Center the chart
        chartBar3D.paddingRight = 20;
        chartBar3D.paddingLeft = 20;
        chartBar3D.paddingTop = 20;
        chartBar3D.paddingBottom = 20;

        // Add data
        chartBar3D.data = chartEntries.map(({ category, value, color }) => ({
          category,
          value,
          color,
        }));

        // Create axes
        var categoryAxis = chartBar3D.xAxes.push(new am4charts.CategoryAxis());
        categoryAxis.dataFields.category = "category";
        categoryAxis.renderer.labels.template.fill =
          am4core.color(chartAxisLabel);
        categoryAxis.renderer.grid.template.stroke = am4core.color(chartGrid);
        categoryAxis.renderer.grid.template.strokeWidth = 1;
        categoryAxis.renderer.grid.template.strokeOpacity = 1;

        var valueAxis = chartBar3D.yAxes.push(new am4charts.ValueAxis());
        valueAxis.renderer.labels.template.fill = am4core.color(chartAxisLabel);
        valueAxis.renderer.grid.template.stroke = am4core.color(chartGrid);
        valueAxis.renderer.grid.template.strokeWidth = 1;
        valueAxis.renderer.grid.template.strokeOpacity = 1;

        // Create series
        var series = chartBar3D.series.push(new am4charts.ColumnSeries3D());
        series.dataFields.valueY = "value";
        series.dataFields.categoryX = "category";
        series.name = "Sentiment";
        series.columns.template.tooltipText = "{categoryX}: [bold]{valueY}[/]";
        series.columns.template.fillOpacity = 0.8;

        // Set colors to match other charts
        series.columns.template.adapter.add("fill", function (fill, target) {
          const dataItem = target?.dataItem;
          const hex =
            dataItem?.dataContext?.color ||
            colors[dataItem?.index ?? 0] ||
            fill;
          return am4core.color(hex);
        });

        // Disable transitions on series/chart
        try {
          chartBar3D.defaultState.transitionDuration = 0;
          chartBar3D.interpolationDuration = 0;
          series.defaultState.transitionDuration = 0;
          series.hiddenState.transitionDuration = 0;
          series.sequencedInterpolation = false;
        } catch (e) {}

        // Add cursor
        chartBar3D.cursor = new am4charts.XYCursor();
        chartBar3D.cursor.lineX.strokeOpacity = 0;
        chartBar3D.cursor.lineY.strokeOpacity = 0;
      } else {
        // Update existing chart data
        chartBar3D.data = chartEntries.map(({ category, value, color }) => ({
          category,
          value,
          color,
        }));
      }
    } else {
      // Default 2D pie chart
      canvas2D.style.display = "block";
      canvas2D.style.visibility = "visible";

      // Create or update 2D chart
      if (chart) {
        // Only update if data has actually changed
        const currentData = chart.data.datasets[0].data;
        const hasChanged = currentData.some(
          (value, index) => value !== newData[index]
        );

        if (hasChanged) {
          chart.data.labels = labels;
          chart.data.datasets[0].data = newData;
          chart.data.datasets[0].backgroundColor = colors;
          chart.update("none");
        }
      } else {
        chart = new Chart(canvas2D, {
          type: "pie",
          data: {
            labels: labels,
            datasets: [
              {
                data: newData,
                backgroundColor: colors,
                borderColor: "#ffffff",
                borderWidth: 2,
                hoverOffset: 8,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                position: "bottom",
                labels: {
                  color: "#334155",
                  boxWidth: 12,
                  boxHeight: 12,
                  usePointStyle: false,
                },
              },
              tooltip: {
                backgroundColor: "rgba(15,23,42,0.9)",
                padding: 10,
                titleColor: "#e2e8f0",
                bodyColor: "#e2e8f0",
              },
            },
            animation: { animateRotate: true, animateScale: false },
          },
        });
      }
    }

    currentChartType = selectedChartType;
    localStorage.setItem("chartType", selectedChartType);
    chartCreated = true;
  }

  // Update chart colors when theme changes (no dispose/redraw to avoid layout shifts)
  function setupThemeChartSync() {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "attributes" && m.attributeName === "data-theme") {
          // Fully recreate charts with new theme colors, animations disabled
          if (typeof drawChart === "function") {
            drawChart();
          } else {
            updateChartsThemeColors();
          }
        }
      }
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
  }

  if (downloadPdf) {
    downloadPdf.addEventListener("click", (event) => {
      if (
        event.defaultPrevented ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        event.button !== 0
      ) {
        return;
      }
      event.preventDefault();
      if (pdfDownloadInFlight || !downloadPdf.href) return;
      pdfDownloadInFlight = true;
      downloadPdfWithProgress(downloadPdf.href, buildPdfFilename())
        .catch(() => {
          /* errors handled in modal */
        })
        .finally(() => {
          pdfDownloadInFlight = false;
        });
    });
  }

  function readChartThemeVars() {
    const styles = getComputedStyle(document.documentElement);
    return {
      positive: styles.getPropertyValue("--chart-positive").trim(),
      neutral: styles.getPropertyValue("--chart-neutral").trim(),
      negative: styles.getPropertyValue("--chart-negative").trim(),
      axis: styles.getPropertyValue("--chart-axis-label").trim(),
      grid: styles.getPropertyValue("--chart-grid").trim(),
    };
  }

  function updateChartsThemeColors() {
    const vars = readChartThemeVars();
    const palette2 = [vars.positive, vars.neutral, vars.negative];

    // anychart 3D pie
    if (chart3D) {
      try {
        // Reapply palette using distinctColors for reliability
        let pal;
        try {
          pal = anychart.palettes.distinctColors();
          pal.items(palette2);
          chart3D.palette(pal);
        } catch (_e) {
          // Fallback to updating existing palette items if available
          const existing = chart3D.palette && chart3D.palette();
          if (existing && typeof existing.items === "function") {
            existing.items(palette2);
          } else {
            chart3D.palette(palette2);
          }
        }
        chart3D.legend().fontColor(vars.axis);
        chart3D.labels().fontColor(vars.axis);
        chart3D.background("transparent");
        if (typeof chart3D.invalidateState === "function") {
          chart3D.invalidateState();
        }
        chart3D.draw(true);
      } catch (e) {}
    }

    // amCharts 3D bar
    if (chartBar3D) {
      try {
        const categoryAxis = chartBar3D.xAxes.getIndex(0);
        const valueAxis = chartBar3D.yAxes.getIndex(0);
        if (categoryAxis) {
          categoryAxis.renderer.labels.template.fill = am4core.color(vars.axis);
          categoryAxis.renderer.grid.template.stroke = am4core.color(vars.grid);
          categoryAxis.renderer.grid.template.strokeWidth = 1;
          categoryAxis.renderer.grid.template.strokeOpacity = 1;
        }
        if (valueAxis) {
          valueAxis.renderer.labels.template.fill = am4core.color(vars.axis);
          valueAxis.renderer.grid.template.stroke = am4core.color(vars.grid);
          valueAxis.renderer.grid.template.strokeWidth = 1;
          valueAxis.renderer.grid.template.strokeOpacity = 1;
        }
        const series = chartBar3D.series.getIndex(0);
        if (series) {
          // Replace adapter to use latest colors
          series.columns.template.adapter.add("fill", function (_fill, target) {
            const idx = target.dataItem?.index || 0;
            const now = readChartThemeVars();
            const barColors = [now.positive, now.neutral, now.negative];
            return am4core.color(barColors[idx % barColors.length]);
          });
          // Force series to re-evaluate fills
          series.invalidate();
          if (typeof series.validateData === "function") {
            series.validateData();
          }
        }
        // Ensure chart applies new styles without layout shift
        if (typeof chartBar3D.invalidateRawData === "function") {
          chartBar3D.invalidateRawData();
        }
        if (typeof chartBar3D.validateData === "function") {
          chartBar3D.validateData();
        }
      } catch (e) {}
    }
  }

  function clearKeywordFilter() {
    if (!filterKeyword) return;
    const hadValue = filterKeyword.value !== "";
    filterKeyword.value = "";
    if (hadValue) {
      filterKeyword.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  function setKeywordFilterPanelState(open, options = {}) {
    if (!keywordFilterPanel || !keywordFilterToggle) return;
    const { focusInput = true, clearOnClose = true } = options;
    keywordFilterPanel.dataset.open = open ? "true" : "false";
    if (open) {
      keywordFilterPanel.removeAttribute("hidden");
      keywordFilterToggle.setAttribute("aria-expanded", "true");
      keywordFilterToggle.classList.add("is-active");
      if (focusInput && filterKeyword) {
        requestAnimationFrame(() => filterKeyword.focus());
      }
    } else {
      keywordFilterPanel.setAttribute("hidden", "");
      keywordFilterToggle.setAttribute("aria-expanded", "false");
      keywordFilterToggle.classList.remove("is-active");
      if (clearOnClose) {
        clearKeywordFilter();
      }
    }
  }

  function drawComments() {
    const s = filterSentiment.value;
    const k = filterKeyword.value.toLowerCase();
    const items = allComments.filter((c) => {
      if (s && c.sentiment_label !== s) return false;
      if (
        k &&
        !(c.original_text || "").toLowerCase().includes(k) &&
        !(c.summary || "").toLowerCase().includes(k)
      )
        return false;
      return true;
    });
    commentsContainer.innerHTML = "";

    // Get progress from analysis meta
    const progress = analysisMeta?.summarization_progress || 0;
    const isSummarizing = analysisStatus === "summarizing";

    // Add overall progress indicator in header if summarizing or completing
    const shouldShowProgress =
      isSummarizing || (progress > 0 && progress < 100);

    if (shouldShowProgress) {
      // Check if progress header already exists
      let progressHeader =
        progressHeaderContainer.querySelector(".progress-header");

      if (!progressHeader) {
        // Create progress header only once
        progressHeader = h(`
          <div class="progress-header">
            <div class="progress-info">
              <span class="progress-title">
                <div class="progress-spinner"></div>
                Summarizing
              </span>
              <span class="progress-percentage">0%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: 0%"></div>
            </div>
          </div>
        `);
        progressHeaderContainer.innerHTML = "";
        progressHeaderContainer.appendChild(progressHeader);

        // Initialize progress values
        currentProgress = 0;
        targetProgress = 0;
      }

      // Always animate to the new progress value (smooth update)
      animateProgress(progress);
    } else if (
      progress >= 100 &&
      progressHeaderContainer.querySelector(".progress-header")
    ) {
      // If progress is 100% or more, animate to 100% then hide after a delay
      animateProgress(100);

      // Show completion state briefly before hiding
      setTimeout(() => {
        const progressHeader =
          progressHeaderContainer.querySelector(".progress-header");
        if (progressHeader) {
          // Add completion class for styling
          progressHeader.classList.add("completed");

          const title = progressHeader.querySelector(".progress-title");
          const spinner = progressHeader.querySelector(".progress-spinner");
          if (title && spinner) {
            spinner.style.display = "none";
            title.innerHTML = "✓ Summarization Complete";
          }
        }

        // Only hide progress header if there are no failed summaries
        // (retry button logic will handle the container in that case)
        const failedCount = allComments.filter(
          (c) => c.summary_status === "error"
        ).length;
        const allBatchesComplete = analysisStatus === "done";

        if (!(failedCount > 0 && allBatchesComplete)) {
          // Hide progress header after showing completion
          setTimeout(() => {
            progressHeaderContainer.innerHTML = "";
            currentProgress = 0;
            targetProgress = 0;
          }, 1500);
        }
      }, 500);
    } else {
      // Only clear if there are no failed summaries that need retry button
      const failedCount = allComments.filter(
        (c) => c.summary_status === "error"
      ).length;
      const allBatchesComplete = analysisStatus === "done";

      if (!(failedCount > 0 && allBatchesComplete)) {
        progressHeaderContainer.innerHTML = "";
        currentProgress = 0;
        targetProgress = 0;
      }
    }

    for (const c of items) {
      let summaryHtml = '<span class="spinner">Summarizing...</span>';
      if (c.summary_status === "ok" && c.summary) {
        summaryHtml = '"' + c.summary + '"';
      } else if (c.summary_status === "error") {
        summaryHtml = '<span style="color:#b91c1c">Summarization Failed</span>';
      }

      // No individual progress indicators on comments

      const original = (c.original_text || "").trim();
      const row = h(`
				<div class="row">
					<div><span class="badge ${c.sentiment_label || "neutral"}">${
        c.sentiment_label || "neutral"
      }</span></div>
					<div>
						<div class="summary-line"><strong>${summaryHtml}</strong></div>
						${
              original
                ? `<button class="btn ghost btn-sm toggle-original" aria-expanded="false">Show original</button>`
                : ""
            }
						${
              original
                ? `<div class="original collapsible" data-open="false"><div class="collapsible-inner">${original.replace(
                    /</g,
                    "&lt;"
                  )}</div></div>`
                : ""
            }
					</div>
				</div>
			`);
      commentsContainer.appendChild(row);
    }

    // Show empty state message when no comments match the filters
    if (items.length === 0) {
      const hasKeywordFilter = k && k.trim() !== "";
      const hasSentimentFilter = s && s !== "";

      let emptyMessage = "";
      if (allComments.length === 0) {
        // No comments at all
        emptyMessage = `<div class="comments-empty-state">
          <div class="comments-empty-state-icon">📝</div>
          <div class="comments-empty-state-title">No comments available</div>
          <div class="comments-empty-state-message">There are no comments to display at the moment.</div>
        </div>`;
      } else if (hasKeywordFilter && hasSentimentFilter) {
        // Both filters active
        emptyMessage = `<div class="comments-empty-state">
          <div class="comments-empty-state-icon">🔍</div>
          <div class="comments-empty-state-title">No comments found</div>
          <div class="comments-empty-state-message">No comments match the keyword "<strong>${k}</strong>" with sentiment "<strong>${s}</strong>". Try adjusting your filters.</div>
        </div>`;
      } else if (hasKeywordFilter) {
        // Only keyword filter active
        emptyMessage = `<div class="comments-empty-state">
          <div class="comments-empty-state-icon">🔍</div>
          <div class="comments-empty-state-title">No matching comments</div>
          <div class="comments-empty-state-message">No comments found containing "<strong>${k}</strong>". Try a different keyword or clear the filter.</div>
        </div>`;
      } else if (hasSentimentFilter) {
        // Only sentiment filter active
        emptyMessage = `<div class="comments-empty-state">
          <div class="comments-empty-state-icon">📊</div>
          <div class="comments-empty-state-title">No comments found</div>
          <div class="comments-empty-state-message">No comments with sentiment "<strong>${s}</strong>" found. Try selecting a different sentiment filter.</div>
        </div>`;
      } else {
        // No filters but no items (shouldn't happen, but handle it)
        emptyMessage = `<div class="comments-empty-state">
          <div class="comments-empty-state-icon">📝</div>
          <div class="comments-empty-state-title">No comments to display</div>
          <div class="comments-empty-state-message">There are no comments available at the moment.</div>
        </div>`;
      }
      commentsContainer.innerHTML = emptyMessage;
    }

    // Add retry button only if there are failed summaries AND all batches are complete
    const failedCount = allComments.filter(
      (c) => c.summary_status === "error"
    ).length;
    const pendingCount = allComments.filter(
      (c) => c.summary_status === "pending"
    ).length;

    // Only show retry button when analysis is done (all batches complete) and there are failed summaries
    const allBatchesComplete = analysisStatus === "done";

    if (failedCount > 0 && allBatchesComplete) {
      const retryButton = h(`
         <div class="retry-section">
           <button id="retryFailedBtn" class="btn" title="Retry ${failedCount} failed summaries">
             <span class="icon icon-refresh"></span> Retry failed (${failedCount})
           </button>
           ${
             pendingCount > 0
               ? `<div style="margin-top: 8px; color: #6b7280; font-size: 14px;"><span class="icon icon-clock"></span> ${pendingCount} summaries in progress...</div>`
               : ""
           }
         </div>
       `);
      progressHeaderContainer.innerHTML = "";
      progressHeaderContainer.appendChild(retryButton);

      // Add model tags below comments (original placement)
      if (modelTagsContainer) modelTagsContainer.innerHTML = "";
      const modelTags = h(`
        <div class="model-tags">
          <div class="model-tags-title">Models used:</div>
          <div class="model-tags-list">
            <span class="model-tag">
              <span class="icon icon-chart"></span> Sentiment: ${
                analysis.sentiment_model === "roberta"
                  ? "RoBERTa (3-class)"
                  : "DistilBERT (2-class)"
              }
            </span>
            <span class="model-tag">
              📝 Summary: ${(() => {
                if (analysis.summary_model === "gemini") {
                  const name =
                    analysis.meta &&
                    (analysis.meta.summary_model_name ||
                      analysis.meta.summary_model);
                  return name ? `Gemini (${name})` : "Gemini API";
                }
                return "Gemma3:1b (Local)";
              })()}
            </span>
          </div>
        </div>
      `);
      if (modelTagsContainer) modelTagsContainer.appendChild(modelTags);

      // Add retry functionality
      retryButton
        .querySelector("#retryFailedBtn")
        .addEventListener("click", async () => {
          const btn = retryButton.querySelector("#retryFailedBtn");
          btn.disabled = true;
          btn.innerHTML = '<span class="icon icon-refresh"></span> Retrying…';

          try {
            const res = await fetch(
              API_BASE + "/analyses/" + analysisId + "/retry-failed-summaries",
              {
                method: "POST",
              }
            );
            const data = await res.json();
            if (data.status === "retry_started") {
              btn.innerHTML = `<span class=\"icon icon-refresh\"></span> Retrying (${data.failed_count})…`;
              // Clear the retry button to make room for progress bar
              progressHeaderContainer.innerHTML = "";

              // Ensure polling is active to track retry progress
              if (!pollId) {
                startPolling();
              }
              // Force an immediate update to show progress bar
              setTimeout(() => load(), 100);
            } else {
              btn.innerHTML =
                '<span class="icon icon-check"></span> No failed to retry';
              btn.disabled = true;
            }
          } catch (err) {
            btn.innerHTML = '<span class="icon icon-x"></span> Retry failed';
            btn.disabled = false;
          }
        });
    } else {
      // Add model tags even when no retry button (below comments)
      if (modelTagsContainer) modelTagsContainer.innerHTML = "";
      const modelTags = h(`
        <div class="model-tags">
          <div class="model-tags-title">Models used:</div>
          <div class="model-tags-list">
            <span class="model-tag">
              <span class="icon icon-chart"></span> Sentiment: ${
                analysis.sentiment_model === "roberta"
                  ? "RoBERTa (3-class)"
                  : "DistilBERT (2-class)"
              }
            </span>
            <span class="model-tag">
              📝 Summary: ${(() => {
                if (analysis.summary_model === "gemini") {
                  const name =
                    analysis.meta &&
                    (analysis.meta.summary_model_name ||
                      analysis.meta.summary_model);
                  return name ? `Gemini (${name})` : "Gemini API";
                }
                return "Gemma3:1b (Local)";
              })()}
            </span>
          </div>
        </div>
      `);
      if (modelTagsContainer) modelTagsContainer.appendChild(modelTags);
    }
  }

  // Toggle original text with smooth animation using event delegation
  commentsContainer.addEventListener("click", (e) => {
    const btn = e.target.closest(".toggle-original");
    if (!btn) return;
    const container = btn.parentElement.querySelector(".original.collapsible");
    if (!container) return;
    const isOpen = container.getAttribute("data-open") === "true";
    if (isOpen) {
      container.style.maxHeight = container.scrollHeight + "px";
      requestAnimationFrame(() => {
        container.style.maxHeight = "0px";
      });
      container.setAttribute("data-open", "false");
      btn.setAttribute("aria-expanded", "false");
      btn.textContent = "Show original";
    } else {
      container.style.maxHeight = container.scrollHeight + "px";
      container.setAttribute("data-open", "true");
      btn.setAttribute("aria-expanded", "true");
      btn.textContent = "Hide original";
    }
  });

  function startPolling() {
    if (pollId) clearInterval(pollId);
    // Use faster polling during retry operations
    const hasFailedSummaries = allComments.some(
      (c) => c.summary_status === "error"
    );
    const pollInterval = hasFailedSummaries ? 3000 : 6000; // 3s during retry, 6s normally

    pollId = setInterval(() => {
      if (!document.hidden) load();
    }, pollInterval);
  }
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (pollId) {
        clearInterval(pollId);
        pollId = null;
      }
    } else {
      startPolling();
    }
  });

  // Add event listeners for toolbar filters
  if (filterSentiment) {
    filterSentiment.addEventListener("change", drawComments);
  }
  if (filterKeyword) {
    filterKeyword.addEventListener("input", drawComments);
    filterKeyword.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        setKeywordFilterPanelState(false, { clearOnClose: true });
        keywordFilterToggle?.focus();
      }
    });
  }
  if (keywordFilterToggle && keywordFilterPanel) {
    keywordFilterToggle.addEventListener("click", () => {
      const isOpen = keywordFilterPanel.dataset.open === "true";
      setKeywordFilterPanelState(!isOpen, {
        focusInput: !isOpen,
        clearOnClose: true,
      });
    });
  }
  if (keywordFilterClose) {
    keywordFilterClose.addEventListener("click", () => {
      setKeywordFilterPanelState(false, { clearOnClose: true });
      keywordFilterToggle?.focus();
    });
  }
  if (
    keywordFilterPanel &&
    keywordFilterToggle &&
    filterKeyword &&
    filterKeyword.value
  ) {
    setKeywordFilterPanelState(true, {
      focusInput: false,
      clearOnClose: false,
    });
  }

  // Add event listener for chart type selector
  if (chartTypeSelector) {
    chartTypeSelector.addEventListener("change", () => {
      const selectedType = chartTypeSelector.value;
      localStorage.setItem("chartType", selectedType);
      currentChartType = selectedType;
      drawChart();
    });
  }

  // Export dropdown interactions
  if (exportBtn && exportMenu) {
    exportBtn.addEventListener("click", () => {
      const isOpen = exportMenu.style.display === "block";
      exportMenu.style.display = isOpen ? "none" : "block";
      exportBtn.setAttribute("aria-expanded", (!isOpen).toString());
    });
    document.addEventListener("click", (e) => {
      if (!exportMenu.contains(e.target) && e.target !== exportBtn) {
        exportMenu.style.display = "none";
        exportBtn.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Handle window resize to maintain chart proportions
  window.addEventListener("resize", () => {
    if (chart) {
      chart.resize();
    }
    if (chartBar2D) {
      chartBar2D.resize();
    }
    if (chart3D) {
      // Force re-center the 3D chart on resize
      setTimeout(() => {
        chart3D.container(container3D);
        chart3D.draw();
      }, 50);
    }
    if (chartBar3D) {
      // AmCharts doesn't need draw() call for updates
    }
  });

  // Clean up charts when page is unloaded
  window.addEventListener("beforeunload", () => {
    if (chart) {
      chart.destroy();
      chart = null;
    }
    if (chartBar2D) {
      chartBar2D.destroy();
      chartBar2D = null;
    }
    if (chart3D) {
      chart3D.dispose();
      chart3D = null;
    }
    if (chartBar3D) {
      chartBar3D.dispose();
      chartBar3D = null;
    }
    chartCreated = false;
  });

  // Show professional loading indicator for wordcloud
  async function showWordcloudLoading() {
    const wordcloudContainer = $("#wordcloud");
    if (!wordcloudContainer) return;

    // Create the loading structure
    wordcloudContainer.innerHTML = `
      <div class="wordcloud-loading">
        <div id="wordcloudLoader" class="logo-loader-container"></div>
        <div class="loading-text">
          <h4>Generating Word Cloud</h4>
          <p>Processing your data with AI...</p>
        </div>
      </div>
    `;

    const wordcloudLoader = $("#wordcloudLoader");
    injectLogoLoader(wordcloudLoader, "logoGradientWordcloud");
  }

  // Generate wordcloud with in-memory caching
  function generateWordCloudWithCache(analysisId) {
    // Check if wordcloud is already cached
    if (wordcloudCache.has(analysisId)) {
      console.log(`Using cached wordcloud for analysis ${analysisId}`);
      const cachedImage = wordcloudCache.get(analysisId);
      displayWordcloud(cachedImage);
      return;
    }

    // Generate wordcloud from API
    showWordcloudLoading();
    generateWordCloudFromAPI(analysisId);
  }

  // Display wordcloud image
  function displayWordcloud(imageData) {
    const img = new Image();
    img.src = imageData;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    img.style.width = "auto";
    img.style.height = "auto";
    img.style.objectFit = "contain";
    img.style.display = "block";
    img.style.margin = "0 auto";
    $("#wordcloud").innerHTML = "";
    $("#wordcloud").appendChild(img);
  }

  // Generate wordcloud from Python API
  async function generateWordCloudFromAPI(analysisId) {
    try {
      const response = await fetch(
        API_BASE + "/analyses/" + analysisId + "/wordcloud"
      );
      if (response.ok) {
        const data = await response.json();

        // Cache the wordcloud image in memory
        wordcloudCache.set(analysisId, data.image);
        console.log(`Cached wordcloud for analysis ${analysisId}`);

        // Display the wordcloud
        displayWordcloud(data.image);
      } else {
        $("#wordcloud").innerHTML = "<p>Wordcloud generation failed</p>";
      }
    } catch (error) {
      console.error("Error generating wordcloud:", error);
      $("#wordcloud").innerHTML = "<p>Error generating wordcloud</p>";
    }
  }

  load();
  startPolling();
}

// History page
if (location.pathname.endsWith("/frontend/history.html")) {
  // Initialize theme toggle for history page
  initializeThemeToggle();

  // Load logo loader for history page
  async function loadHistoryLogoLoader() {
    try {
      const response = await fetch("/static/components/logo_loader.html");
      const html = await response.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const loaderDiv = doc.querySelector(".loader");

      if (loaderDiv) {
        // Load main history loader
        const historyLoader = $("#historyLoader");
        if (historyLoader) {
          historyLoader.innerHTML = loaderDiv.outerHTML;
          const loader = historyLoader.querySelector(".loader");
          if (loader) {
            loader.classList.add("logo-loader");
            const svg = loader.querySelector("svg");
            if (svg) {
              addGradientToSVG(svg, "logoGradientHistory");
            }
          }
        }

        // Load model loader (will be shown when needed)
        const modelLoader = $("#modelLoader");
        if (modelLoader) {
          modelLoader.innerHTML = loaderDiv.outerHTML;
          const loader = modelLoader.querySelector(".loader");
          if (loader) {
            loader.classList.add("logo-loader");
            const svg = loader.querySelector("svg");
            if (svg) {
              addGradientToSVG(svg, "logoGradientModel");
            }
          }
        }
      }
    } catch (error) {
      console.error("Failed to load logo loader for history:", error);
      // Fallback to original spinner
      const historyLoader = $("#historyLoader");
      const modelLoader = $("#modelLoader");
      if (historyLoader) {
        historyLoader.innerHTML = '<div class="loading-spinner"></div>';
      }
      if (modelLoader) {
        modelLoader.innerHTML = '<div class="loading-spinner"></div>';
      }
    }
  }

  // Load the logo loader when page loads
  loadHistoryLogoLoader();

  // DOM elements
  const analysesTable = $("#analysesTable");
  const loadingState = $("#loadingState");
  const emptyState = $("#emptyState");
  const errorState = $("#errorState");
  const searchInput = $("#searchInput");
  const clearSearchBtn = $("#clearSearch");
  const sortSelect = $("#sortSelect");
  const statusFilter = $("#statusFilter");
  const refreshBtn = $("#refreshBtn");
  const filterMenuBtn = $("#filterMenuBtn");
  const filterSheetPanel = $("#filterInlineControls");
  const filterSheetOverlay = $("#filterSheetOverlay");
  const filterSheetHandle = $("#filterSheetHandle");
  const retryBtn = $("#retryBtn");
  const deleteModal = $("#deleteModal");
  const closeDeleteModal = $("#closeDeleteModal");
  const confirmDelete = $("#confirmDelete");
  const deletePreview = $("#deletePreview");
  const pagination = $("#pagination");
  const prevPage = $("#prevPage");
  const nextPage = $("#nextPage");
  const paginationNumbers = $("#paginationNumbers");
  const compactPaginationMQ = window.matchMedia("(max-width: 640px)");
  const mobileFilterMQ = window.matchMedia("(max-width: 768px)");

  // Stats elements
  const totalAnalyses = $("#totalAnalyses");
  const completedAnalyses = $("#completedAnalyses");
  const processingAnalyses = $("#processingAnalyses");
  const errorAnalyses = $("#errorAnalyses");

  // State
  let allAnalyses = [];
  let filteredAnalyses = [];
  let currentPage = 1;
  let itemsPerPage = 12;
  let deleteTargetId = null;
  let currentSort = { field: "created_at", direction: "desc" };

  // Utility functions
  function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffMs / (1000 * 60));

    if (diffDays > 7) {
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } else if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? "s" : ""} ago`;
    } else if (diffHours > 0) {
      return `${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    } else if (diffMinutes > 0) {
      return `${diffMinutes} minute${diffMinutes > 1 ? "s" : ""} ago`;
    } else {
      return "Just now";
    }
  }

  function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  }

  function getStatusClass(status) {
    switch (status) {
      case "done":
        return "completed";
      case "processing":
      case "summarizing":
        return "processing";
      case "error":
        return "error";
      default:
        return "processing";
    }
  }

  function getStatusText(status) {
    switch (status) {
      case "done":
        return "Completed";
      case "processing":
        return "Processing";
      case "summarizing":
        return "Summarizing";
      case "error":
        return "Error";
      default:
        return "Processing";
    }
  }

  function getStatusIcon(status) {
    switch (status) {
      case "done":
        return '<span class="icon icon-check"></span>';
      case "processing":
      case "summarizing":
        return '<span class="icon icon-clock"></span>';
      case "error":
        return '<span class="icon icon-x"></span>';
      default:
        return '<span class="icon icon-clock"></span>';
    }
  }

  // Filter and sort functions
  function filterAnalyses() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const statusFilterValue = statusFilter.value;

    filteredAnalyses = allAnalyses.filter((analysis) => {
      const matchesSearch =
        !searchTerm ||
        (analysis.name && analysis.name.toLowerCase().includes(searchTerm)) ||
        analysis.id.toLowerCase().includes(searchTerm);

      const matchesStatus =
        statusFilterValue === "all" ||
        (statusFilterValue === "done" && analysis.status === "done") ||
        (statusFilterValue === "processing" &&
          (analysis.status === "processing" ||
            analysis.status === "summarizing")) ||
        (statusFilterValue === "error" && analysis.status === "error");

      return matchesSearch && matchesStatus;
    });

    sortAnalyses();
    updateStats();
    renderAnalyses();
    updatePagination();
  }

  function sortAnalyses() {
    const sortValue = sortSelect.value;

    filteredAnalyses.sort((a, b) => {
      switch (sortValue) {
        case "newest":
          return new Date(b.created_at) - new Date(a.created_at);
        case "oldest":
          return new Date(a.created_at) - new Date(b.created_at);
        case "name":
          return (a.name || a.id).localeCompare(b.name || b.id);
        case "name-desc":
          return (b.name || b.id).localeCompare(a.name || a.id);
        default:
          return 0;
      }
    });
  }

  // Render functions
  function renderAnalyses() {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageAnalyses = filteredAnalyses.slice(startIndex, endIndex);

    if (pageAnalyses.length === 0) {
      analysesTable.innerHTML = "";
      if (filteredAnalyses.length === 0 && allAnalyses.length > 0) {
        emptyState.style.display = "flex";
        emptyState.querySelector("h3").textContent =
          "No analyses match your filters";
        emptyState.querySelector("p").textContent =
          "Try adjusting your search or filter criteria.";
      }
      return;
    }

    emptyState.style.display = "none";

    renderTableView(pageAnalyses);
  }

  function renderTableView(pageAnalyses) {
    analysesTable.style.display = "flex";
    analysesTable.innerHTML = "";

    pageAnalyses.forEach((analysis) => {
      const rowCard = createAnalysisRowCard(analysis);
      analysesTable.appendChild(rowCard);
    });
  }

  function createAnalysisRowCard(analysis) {
    const statusClass = getStatusClass(analysis.status);
    const statusText = getStatusText(analysis.status);
    const statusIcon = getStatusIcon(analysis.status);
    const createdDate = formatDate(analysis.created_at);

    // Get sentiment counts
    const counts = analysis.sentiment_counts || {
      positive: 0,
      neutral: 0,
      negative: 0,
    };
    const sentimentModel = (analysis.sentiment_model || "").toLowerCase();
    const isBinarySentiment = sentimentModel.includes("distilbert");
    const totalComments = isBinarySentiment
      ? (counts.positive || 0) + (counts.negative || 0)
      : (counts.positive || 0) + (counts.neutral || 0) + (counts.negative || 0);

    const sentimentsMarkup = isBinarySentiment
      ? `
          <div class="sentiment-item positive">
            <div class="sentiment-value">${counts.positive || 0}</div>
            <div class="sentiment-label">Positive</div>
          </div>
          <div class="sentiment-item negative">
            <div class="sentiment-value">${counts.negative || 0}</div>
            <div class="sentiment-label">Negative</div>
          </div>
        `
      : `
          <div class="sentiment-item positive">
            <div class="sentiment-value">${counts.positive || 0}</div>
            <div class="sentiment-label">Positive</div>
          </div>
          <div class="sentiment-item neutral">
            <div class="sentiment-value">${counts.neutral || 0}</div>
            <div class="sentiment-label">Neutral</div>
          </div>
          <div class="sentiment-item negative">
            <div class="sentiment-value">${counts.negative || 0}</div>
            <div class="sentiment-label">Negative</div>
          </div>
        `;

    // File info not needed in compact professional view

    const rowCard = h(`
      <div class="table-row-card ${statusClass}" data-id="${analysis.id}">
        <div class="row-card-header">
          <div class="row-card-title">
            <h3 class="row-card-name">${
              analysis.name || "Untitled Analysis"
            }</h3>
          </div>
          <span class="row-card-status ${statusClass}">
            ${statusIcon}
            <span>${statusText}</span>
          </span>
        </div>
        
        <div class="row-card-content">
          <div class="row-card-meta">
            <div class="meta-item">
              <span class="meta-label">Created</span>
              <span class="meta-value">${createdDate}</span>
            </div>
          </div>

          ${
            totalComments > 0
              ? `
          <div class="row-card-sentiment">
            ${sentimentsMarkup}
          </div>
          `
              : ""
          }
        </div>

        <div class="row-card-actions">
          <a href="/frontend/dashboard.html?analysis_id=${encodeURIComponent(
            analysis.id
          )}" 
             class="row-action-btn btn-primary">
            <span class="icon icon-chart"></span>
            <span>View</span>
          </a>
          <button class="row-action-btn btn-danger delete-btn" data-id="${
            analysis.id
          }">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 105.16 122.88" width="18px" height="18px"><path fill="white" fill-rule="evenodd" d="M11.17,37.16H94.65a8.4,8.4,0,0,1,2,.16,5.93,5.93,0,0,1,2.88,1.56,5.43,5.43,0,0,1,1.64,3.34,7.65,7.65,0,0,1-.06,1.44L94,117.31v0l0,.13,0,.28v0a7.06,7.06,0,0,1-.2.9v0l0,.06v0a5.89,5.89,0,0,1-5.47,4.07H17.32a6.17,6.17,0,0,1-1.25-.19,6.17,6.17,0,0,1-1.16-.48h0a6.18,6.18,0,0,1-3.08-4.88l-7-73.49a7.69,7.69,0,0,1-.06-1.66,5.37,5.37,0,0,1,1.63-3.29,6,6,0,0,1,3-1.58,8.94,8.94,0,0,1,1.79-.13ZM5.65,8.8H37.12V6h0a2.44,2.44,0,0,1,0-.27,6,6,0,0,1,1.76-4h0A6,6,0,0,1,43.09,0H62.46l.3,0a6,6,0,0,1,5.7,6V6h0V8.8h32l.39,0a4.7,4.7,0,0,1,4.31,4.43c0,.18,0,.32,0,.5v9.86a2.59,2.59,0,0,1-2.59,2.59H2.59A2.59,2.59,0,0,1,0,23.62V13.53H0a1.56,1.56,0,0,1,0-.31v0A4.72,4.72,0,0,1,3.88,8.88,10.4,10.4,0,0,1,5.65,8.8Zm42.1,52.7a4.77,4.77,0,0,1,9.49,0v37a4.77,4.77,0,0,1-9.49,0v-37Zm23.73-.2a4.58,4.58,0,0,1,5-4.06,4.47,4.47,0,0,1,4.51,4.46l-2,37a4.57,4.57,0,0,1-5,4.06,4.47,4.47,0,0,1-4.51-4.46l2-37ZM25,61.7a4.46,4.46,0,0,1,4.5-4.46,4.58,4.58,0,0,1,5,4.06l2,37a4.47,4.47,0,0,1-4.51,4.46,4.57,4.57,0,0,1-5-4.06l-2-37Z"/></svg>
          </button>
        </div>
      </div>
    `);

    // Add click handler for the card (opens analysis)
    rowCard.addEventListener("click", (e) => {
      if (!e.target.closest(".row-card-actions")) {
        window.location.href = `/frontend/dashboard.html?analysis_id=${encodeURIComponent(
          analysis.id
        )}`;
      }
    });

    // Add delete button handler using event delegation
    rowCard.addEventListener("click", (e) => {
      if (e.target.closest(".delete-btn")) {
        e.stopPropagation();
        showDeleteModal(analysis);
      }
    });

    return rowCard;
  }

  function showDeleteModal(analysis) {
    deleteTargetId = analysis.id;
    deletePreview.innerHTML = `
      <div class="analysis-preview-card">
        <h4>${analysis.name || "Untitled Analysis"}</h4>
        <p><strong>Created:</strong> ${formatDate(analysis.created_at)}</p>
        <p><strong>Status:</strong> ${getStatusText(analysis.status)}</p>
      </div>
    `;
    deleteModal.style.display = "flex";
    lockBodyScroll();
  }

  function hideDeleteModal() {
    deleteModal.style.display = "none";
    deleteTargetId = null;
    unlockBodyScroll();
  }

  // Stats functions
  function updateStats() {
    const total = allAnalyses.length;
    const completed = allAnalyses.filter((a) => a.status === "done").length;
    const processing = allAnalyses.filter(
      (a) => a.status === "processing" || a.status === "summarizing"
    ).length;
    const errors = allAnalyses.filter((a) => a.status === "error").length;

    totalAnalyses.textContent = total;
    completedAnalyses.textContent = completed;
    processingAnalyses.textContent = processing;
    errorAnalyses.textContent = errors;
  }

  // Pagination functions
  function generatePageNumbers(current, total, isCompact = false) {
    if (isCompact) {
      const compactPages = [];
      const addUnique = (value) => {
        if (!compactPages.includes(value)) {
          compactPages.push(value);
        }
      };

      // For compact mode, show fewer pages but still dynamic based on current
      if (total <= 4) {
        // Show all pages if total is small
        for (let i = 1; i <= total; i++) {
          addUnique(i);
        }
        return compactPages;
      }

      // Always show first page
      addUnique(1);

      // Determine range around current page (smaller range for compact)
      let start = Math.max(2, current - 1);
      let end = Math.min(total - 1, current + 1);

      // Adjust if we're near the start
      if (current <= 2) {
        end = Math.min(3, total - 1);
      }

      // Adjust if we're near the end
      if (current >= total - 1) {
        start = Math.max(2, total - 2);
      }

      // Add ellipsis after first page if needed
      if (start > 2) {
        compactPages.push("ellipsis-start");
      }

      // Add middle pages
      for (let i = start; i <= end; i++) {
        addUnique(i);
      }

      // Add ellipsis before last page if needed
      if (end < total - 1) {
        compactPages.push("ellipsis-end");
      }

      // Always show last page
      if (total > 1) {
        addUnique(total);
      }

      return compactPages;
    }

    const pages = [];
    const maxVisible = 7; // Show up to 7 page numbers

    if (total <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      let start = Math.max(2, current - 1);
      let end = Math.min(total - 1, current + 1);

      // Adjust if we're near the start
      if (current <= 3) {
        end = Math.min(5, total - 1);
      }

      // Adjust if we're near the end
      if (current >= total - 2) {
        start = Math.max(2, total - 4);
      }

      // Add ellipsis after first page if needed
      if (start > 2) {
        pages.push("ellipsis-start");
      }

      // Add middle pages
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      // Add ellipsis before last page if needed
      if (end < total - 1) {
        pages.push("ellipsis-end");
      }

      // Always show last page
      if (total > 1) {
        pages.push(total);
      }
    }

    return pages;
  }

  function updatePagination() {
    const totalPages = Math.ceil(filteredAnalyses.length / itemsPerPage);

    if (totalPages <= 1) {
      pagination.style.display = "none";
      return;
    }

    pagination.style.display = "flex";
    prevPage.disabled = currentPage === 1;
    nextPage.disabled = currentPage === totalPages;

    // Generate and render page numbers
    const pageNumbers = generatePageNumbers(
      currentPage,
      totalPages,
      compactPaginationMQ.matches
    );
    paginationNumbers.innerHTML = "";

    pageNumbers.forEach((page) => {
      if (page === "ellipsis-start" || page === "ellipsis-end") {
        const ellipsis = document.createElement("span");
        ellipsis.className = "pagination-ellipsis";
        ellipsis.textContent = "...";
        paginationNumbers.appendChild(ellipsis);
      } else {
        const button = document.createElement("button");
        button.className = "pagination-number";
        button.textContent = page;
        button.type = "button";
        if (page === currentPage) {
          button.classList.add("active");
        }
        button.addEventListener("click", () => goToPage(page));
        paginationNumbers.appendChild(button);
      }
    });
  }

  function goToPage(page) {
    const totalPages = Math.ceil(filteredAnalyses.length / itemsPerPage);
    if (page >= 1 && page <= totalPages) {
      currentPage = page;
      renderAnalyses();
      updatePagination();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // State management
  function showLoading() {
    loadingState.style.display = "flex";
    emptyState.style.display = "none";
    errorState.style.display = "none";
    analysesTable.innerHTML = "";
  }

  function showError(message) {
    loadingState.style.display = "none";
    emptyState.style.display = "none";
    errorState.style.display = "flex";
    errorMessage.textContent = message;
  }

  function showEmpty() {
    loadingState.style.display = "none";
    emptyState.style.display = "flex";
    errorState.style.display = "none";
    analysesTable.innerHTML = "";
  }

  function showContent() {
    loadingState.style.display = "none";
    emptyState.style.display = "none";
    errorState.style.display = "none";
  }

  function playRefreshSpin() {
    if (!refreshBtn) return;
    const icon = refreshBtn.querySelector(".btn-icon");
    refreshBtn.classList.remove("is-spinning");
    void refreshBtn.offsetWidth;
    refreshBtn.classList.add("is-spinning");
    if (icon) {
      const handle = () => {
        refreshBtn.classList.remove("is-spinning");
        icon.removeEventListener("animationend", handle);
      };
      icon.addEventListener("animationend", handle);
    }
  }

  function isMobileFilters() {
    return mobileFilterMQ.matches;
  }

  function updateFilterSheetAria(isOpen) {
    if (filterSheetPanel) {
      filterSheetPanel.setAttribute("aria-hidden", isOpen ? "false" : "true");
    }
    if (filterMenuBtn) {
      filterMenuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
      filterMenuBtn.classList.toggle("is-active", Boolean(isOpen));
    }
    if (filterSheetOverlay) {
      filterSheetOverlay.setAttribute("aria-hidden", isOpen ? "false" : "true");
    }
  }

  function openFilterSheet() {
    if (!filterSheetPanel) return;
    filterSheetPanel.classList.add("is-active");
    if (isMobileFilters()) {
      filterSheetPanel.style.transition = "";
      filterSheetPanel.style.transform = "";
    }
    if (filterSheetOverlay) filterSheetOverlay.classList.add("is-visible");
    if (isMobileFilters() && !filterSheetScrollLocked) {
      lockBodyScroll();
      filterSheetScrollLocked = true;
    }
    updateFilterSheetAria(true);
    requestAnimationFrame(() => {
      sortSelect?.focus({ preventScroll: true });
    });
  }

  function closeFilterSheet() {
    if (!filterSheetPanel) return;
    filterSheetPanel.classList.remove("is-active");
    if (isMobileFilters()) {
      filterSheetPanel.style.transition = "";
      filterSheetPanel.style.transform = "";
    }
    if (filterSheetOverlay) filterSheetOverlay.classList.remove("is-visible");
    if (filterSheetScrollLocked) {
      unlockBodyScroll();
      filterSheetScrollLocked = false;
    }
    updateFilterSheetAria(false);
  }

  function toggleFilterSheet() {
    if (!filterSheetPanel) return;
    if (filterSheetPanel.classList.contains("is-active")) {
      closeFilterSheet();
    } else {
      openFilterSheet();
    }
  }

  let filterSheetDragTracking = false;
  let filterSheetDragActive = false;
  let filterSheetDragStart = 0;
  let filterSheetDragEventType = null;
  let filterSheetCapturedPointer = null;
  let filterSheetScrollLocked = false;
  const FILTER_SHEET_ACTIVATE_DELTA = 10;
  const FILTER_SHEET_CLOSE_DELTA = 100;

  const FILTER_SHEET_DRAG_EVENTS = {
    pointer: {
      move: "pointermove",
      end: "pointerup",
      cancel: "pointercancel",
    },
    touch: {
      move: "touchmove",
      end: "touchend",
      cancel: "touchcancel",
    },
    mouse: {
      move: "mousemove",
      end: "mouseup",
      cancel: "mouseleave",
    },
  };

  function getFilterSheetClientY(event) {
    if (event?.touches?.length) {
      return event.touches[0].clientY;
    }
    if (event?.changedTouches?.length) {
      return event.changedTouches[0].clientY;
    }
    return typeof event?.clientY === "number" ? event.clientY : null;
  }

  function attachFilterSheetDragListeners(type) {
    filterSheetDragEventType = type;
    const map =
      FILTER_SHEET_DRAG_EVENTS[type] || FILTER_SHEET_DRAG_EVENTS.pointer;
    const moveOptions = type === "touch" ? { passive: false } : undefined;
    window.addEventListener(map.move, handleFilterSheetDragMove, moveOptions);
    window.addEventListener(map.end, handleFilterSheetDragEnd);
    if (map.cancel && map.cancel !== map.end) {
      window.addEventListener(map.cancel, handleFilterSheetDragEnd);
    }
  }

  function detachFilterSheetDragListeners() {
    if (!filterSheetDragEventType) return;
    const map =
      FILTER_SHEET_DRAG_EVENTS[filterSheetDragEventType] ||
      FILTER_SHEET_DRAG_EVENTS.pointer;
    window.removeEventListener(map.move, handleFilterSheetDragMove);
    window.removeEventListener(map.end, handleFilterSheetDragEnd);
    if (map.cancel && map.cancel !== map.end) {
      window.removeEventListener(map.cancel, handleFilterSheetDragEnd);
    }
    filterSheetDragEventType = null;
  }

  function isFilterSheetDragHandle(target) {
    if (!target) return false;
    return Boolean(
      target.closest(".filter-sheet-header") ||
        target.closest(".filter-sheet-drag")
    );
  }

  function handleFilterSheetDragStart(event) {
    if (
      !filterSheetPanel ||
      !filterSheetPanel.classList.contains("is-active") ||
      !isMobileFilters()
    ) {
      return;
    }
    if (!isFilterSheetDragHandle(event.target)) {
      return;
    }
    const startY = getFilterSheetClientY(event);
    if (typeof startY !== "number") return;
    filterSheetDragTracking = true;
    filterSheetDragActive = false;
    filterSheetDragStart = startY;
    const dragType = event.type.startsWith("touch")
      ? "touch"
      : event.type.startsWith("mouse")
      ? "mouse"
      : event.pointerType === "touch"
      ? "touch"
      : event.pointerType === "mouse"
      ? "mouse"
      : "pointer";
    if (dragType === "pointer" && event.pointerId != null) {
      filterSheetCapturedPointer = event.pointerId;
      filterSheetPanel.setPointerCapture?.(event.pointerId);
    } else {
      filterSheetCapturedPointer = null;
    }
    attachFilterSheetDragListeners(dragType);
  }

  function handleFilterSheetDragMove(event) {
    if (!filterSheetDragTracking || !filterSheetPanel) return;
    const currentY = getFilterSheetClientY(event);
    if (typeof currentY !== "number") return;
    const delta = Math.max(0, currentY - filterSheetDragStart);
    if (!filterSheetDragActive) {
      if (delta < FILTER_SHEET_ACTIVATE_DELTA) return;
      filterSheetDragActive = true;
      filterSheetPanel.style.transition = "none";
    }
    if (filterSheetDragEventType === "touch" && event.cancelable) {
      event.preventDefault();
    }
    filterSheetPanel.style.transform = `translateY(${delta}px)`;
  }

  function handleFilterSheetDragEnd(event) {
    if (!filterSheetDragTracking || !filterSheetPanel) return;
    const currentY = getFilterSheetClientY(event) ?? filterSheetDragStart;
    const delta = Math.max(0, currentY - filterSheetDragStart);
    filterSheetDragTracking = false;
    if (
      filterSheetCapturedPointer != null &&
      filterSheetPanel.hasPointerCapture?.(filterSheetCapturedPointer)
    ) {
      filterSheetPanel.releasePointerCapture(filterSheetCapturedPointer);
    }
    filterSheetCapturedPointer = null;
    detachFilterSheetDragListeners();
    if (!filterSheetDragActive) {
      filterSheetDragEventType = null;
      return;
    }
    filterSheetDragActive = false;
    filterSheetPanel.style.transition = "";
    filterSheetPanel.style.transform = "";
    if (delta > FILTER_SHEET_CLOSE_DELTA) {
      closeFilterSheet();
    }
  }

  // Main load function
  async function load() {
    showLoading();

    try {
      const res = await fetch(API_BASE + "/analyses");
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();
      allAnalyses = data.items || [];

      if (allAnalyses.length === 0) {
        showEmpty();
        return;
      }

      showContent();
      filterAnalyses();
    } catch (error) {
      console.error("Error loading analyses:", error);
      showError(error.message);
    }
  }

  // Event listeners
  function updateClearSearchVisibility() {
    if (clearSearchBtn) {
      const hasText = (searchInput?.value || "").trim().length > 0;
      clearSearchBtn.style.display = hasText ? "block" : "none";
    }
  }

  // Initialize clear button visibility
  updateClearSearchVisibility();

  searchInput.addEventListener("input", () => {
    currentPage = 1;
    filterAnalyses();
    updateClearSearchVisibility();
  });

  clearSearchBtn.addEventListener("click", () => {
    searchInput.value = "";
    currentPage = 1;
    filterAnalyses();
    updateClearSearchVisibility();
    searchInput.focus();
  });

  sortSelect.addEventListener("change", () => {
    currentPage = 1;
    filterAnalyses();
  });

  statusFilter.addEventListener("change", () => {
    currentPage = 1;
    filterAnalyses();
  });

  refreshBtn.addEventListener("click", () => {
    playRefreshSpin();
    load();
  });

  filterMenuBtn?.addEventListener("click", toggleFilterSheet);
  filterSheetOverlay?.addEventListener("click", closeFilterSheet);

  if (window.PointerEvent) {
    filterSheetPanel?.addEventListener(
      "pointerdown",
      handleFilterSheetDragStart,
      {
        passive: false,
      }
    );
  } else {
    filterSheetPanel?.addEventListener(
      "touchstart",
      handleFilterSheetDragStart,
      {
        passive: false,
      }
    );
    filterSheetPanel?.addEventListener("mousedown", handleFilterSheetDragStart);
  }

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      filterSheetPanel?.classList.contains("is-active")
    ) {
      closeFilterSheet();
    }
  });

  const filterMediaChangeHandler = () => {
    closeFilterSheet();
  };
  if (mobileFilterMQ.addEventListener) {
    mobileFilterMQ.addEventListener("change", filterMediaChangeHandler);
  } else if (mobileFilterMQ.addListener) {
    mobileFilterMQ.addListener(filterMediaChangeHandler);
  }

  const paginationMediaChangeHandler = () => {
    updatePagination();
  };
  if (compactPaginationMQ.addEventListener) {
    compactPaginationMQ.addEventListener(
      "change",
      paginationMediaChangeHandler
    );
  } else if (compactPaginationMQ.addListener) {
    compactPaginationMQ.addListener(paginationMediaChangeHandler);
  }

  updateFilterSheetAria(false);
  retryBtn.addEventListener("click", load);

  // Modal event listeners
  closeDeleteModal.addEventListener("click", hideDeleteModal);

  confirmDelete.addEventListener("click", async () => {
    if (!deleteTargetId) return;

    try {
      const res = await fetch(API_BASE + "/analyses/" + deleteTargetId, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error(`Failed to delete analysis: ${res.statusText}`);
      }

      hideDeleteModal();
      await load(); // Reload the list
    } catch (error) {
      console.error("Error deleting analysis:", error);
      alert("Failed to delete analysis: " + error.message);
    }
  });

  // Close modal when clicking outside
  deleteModal.addEventListener("click", (e) => {
    if (e.target === deleteModal) {
      hideDeleteModal();
    }
  });

  // Pagination event listeners
  prevPage.addEventListener("click", () => goToPage(currentPage - 1));
  nextPage.addEventListener("click", () => goToPage(currentPage + 1));

  // Keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && deleteModal.style.display === "flex") {
      hideDeleteModal();
    }
    if (e.key === "r" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      load();
    }
  });

  // Initialize
  load();
}

// Fallback theme initialization for all pages
document.addEventListener("DOMContentLoaded", () => {
  // Fixed header offset: compute and apply CSS var and body class
  (function applyFixedHeaderOffset() {
    try {
      const header = document.querySelector("header.container");
      if (!header) return;
      function setOffset() {
        const h = header.getBoundingClientRect().height;
        document.documentElement.style.setProperty("--header-height", h + "px");
        document.body.classList.add("has-fixed-header");
      }
      setOffset();
      let rafId = null;
      window.addEventListener("resize", () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(setOffset);
      });
    } catch (_) {}
  })();
  // Only initialize if not already initialized by page-specific code
  if (!document.documentElement.hasAttribute("data-theme")) {
    initializeThemeToggle();
  }

  // Ensure charts react to theme changes without page reload (dashboard only)
  if (typeof setupThemeChartSync === "function") {
    setupThemeChartSync();
  }

  // Sliding underline for header nav active link
  (function initSlidingNavUnderline() {
    try {
      const header = document.querySelector("header.container");
      if (!header) return;
      const nav = header.querySelector("nav");
      if (!nav) return;
      const links = Array.from(nav.querySelectorAll("a[href]"));
      if (!links.length) return;

      let underline = nav.querySelector(".nav-underline");
      if (!underline) {
        underline = document.createElement("div");
        underline.className = "nav-underline";
        nav.appendChild(underline);
      }

      function computeUnderlineTarget(link) {
        const rect = link.getBoundingClientRect();
        const navRect = nav.getBoundingClientRect();
        // Compute left/right padding to cover text only (skip icon)
        const style = getComputedStyle(link);
        const paddingLeft = parseFloat(style.paddingLeft) || 0;
        const paddingRight = parseFloat(style.paddingRight) || 0;
        let leftOffset = rect.left - navRect.left + paddingLeft;
        let rightOffset = rect.right - navRect.left - paddingRight;

        const icon = link.querySelector(".icon");
        if (icon) {
          const iconRect = icon.getBoundingClientRect();
          // Add gap between icon and text; gap is 8px in CSS
          const gap = 8;
          leftOffset = iconRect.right - navRect.left + gap;
        }

        const width = Math.max(0, rightOffset - leftOffset);
        return { left: leftOffset, width };
      }

      function updateUnderline(animate = true) {
        const active = nav.querySelector("a.active");
        if (!active) {
          // Hide underline completely when no active link for this page
          underline.style.opacity = "0";
          underline.style.width = "0px";
          underline.style.transform = "translateX(0px)";
          return;
        }
        const { left, width } = computeUnderlineTarget(active);
        underline.style.opacity = width > 0 ? "1" : "0";
        underline.style.width = width + "px";
        underline.style.transform = `translateX(${left}px)`;
        if (!animate) {
          // Disable transitions for first paint
          const prev = underline.style.transition;
          underline.style.transition = "none";
          // Force reflow
          void underline.offsetWidth;
          underline.style.transition = prev;
        }
      }

      // Persist previous(active) and next(clicked) for cross-page animation
      nav.addEventListener("click", (e) => {
        const link = e.target.closest("a[href]");
        if (link) {
          try {
            const currentActive = nav.querySelector("a.active");
            const fromHref = currentActive?.getAttribute("href") || "";
            const toHref = link.getAttribute("href") || "";
            sessionStorage.setItem("nav_prev_from", fromHref);
            sessionStorage.setItem("nav_prev_to", toHref);
          } catch (_) {}
        }
      });

      // Determine and set active link based on current page
      const currentPath = location.pathname.replace(/\/?$/, "");
      links.forEach((a) => a.classList.remove("active"));
      const match = links.find((a) => {
        try {
          const href = a.getAttribute("href") || "";
          const url = new URL(href, location.origin);
          const path = url.pathname.replace(/\/?$/, "");
          return path === currentPath;
        } catch (_) {
          return false;
        }
      });
      if (match) match.classList.add("active");

      // Initialize underline; if previous page is known, animate from previous active to current active
      requestAnimationFrame(() => {
        let prevFrom = null;
        let prevTo = null;
        try {
          prevFrom = sessionStorage.getItem("nav_prev_from") || null;
          prevTo = sessionStorage.getItem("nav_prev_to") || null;
          // Clear after reading to avoid stale moves on refresh
          sessionStorage.removeItem("nav_prev_from");
          sessionStorage.removeItem("nav_prev_to");
        } catch (_) {}

        const active = nav.querySelector("a.active");
        const activeHref = active?.getAttribute("href") || null;
        const shouldAnimate = prevTo && activeHref && prevTo === activeHref;
        const prevLink =
          shouldAnimate && prevFrom
            ? links.find((a) => a.getAttribute("href") === prevFrom)
            : null;

        if (active && prevLink && prevLink !== active) {
          // Start at previous link position without transition
          const prev = underline.style.transition;
          underline.style.transition = "none";
          const start = computeUnderlineTarget(prevLink);
          underline.style.opacity = start.width > 0 ? "1" : "0";
          underline.style.width = start.width + "px";
          underline.style.transform = `translateX(${start.left}px)`;
          void underline.offsetWidth;
          // Restore transition and animate to active
          underline.style.transition =
            prev ||
            "transform 320ms ease, width 320ms ease, opacity 220ms ease";
          const end = computeUnderlineTarget(active);
          underline.style.opacity = end.width > 0 ? "1" : "0";
          underline.style.width = end.width + "px";
          underline.style.transform = `translateX(${end.left}px)`;
        } else {
          // Position instantly based on active (or hide if none)
          updateUnderline(false);
        }
      });

      // Recompute on resize to keep alignment
      let rafId = null;
      window.addEventListener("resize", () => {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => updateUnderline(false));
      });

      // Only move on active changes (no hover/focus tracking)

      // Mutation observer to react when active class changes (page nav)
      const mo = new MutationObserver(() => updateUnderline());
      links.forEach((a) =>
        mo.observe(a, { attributes: true, attributeFilter: ["class"] })
      );
    } catch (_) {}
  })();

  // Global Settings initializer available on all pages
  (function initGlobalSettings() {
    settingsModalReady
      .then((modal) => {
        if (!modal) return;
        cacheSettingsElementRefs();
        const btn = document.querySelector("#settingsBtn");
        const closeX = document.querySelector("#closeSettings");
        const themeCards = document.querySelector("#themeCards");
        const summarySel = document.querySelector("#settingsSummarySelector");
        const sentimentSel = document.querySelector(
          "#settingsSentimentSelector"
        );
        const clearWCBtn = document.querySelector("#clearWordcloudCacheBtn");
        const settingsContent = document.querySelector(".settings-content");
        const settingsLayout = document.querySelector(".settings-layout");
        const backBtn = document.querySelector("#settingsBackBtn");
        const mobileTitle = document.querySelector("#settingsMobileTitle");
        const modalContentEl = modal.querySelector(".modal-content");
        const settingsDragHandle = document.querySelector(
          "#settingsDragHandle"
        );
        const settingsMobileMQ = window.matchMedia("(max-width: 768px)");
        let settingsSheetCloseTimeout = null;
        let settingsSheetDragTracking = false;
        let settingsSheetDragActive = false;
        let settingsSheetDragStart = 0;
        let settingsDragEventType = null;
        let settingsSheetCapturedPointer = null;
        const SETTINGS_SHEET_ACTIVATE_DELTA = 10;
        const SETTINGS_SHEET_CLOSE_DELTA = 100;
        const SETTINGS_DRAG_EVENTS = {
          pointer: {
            move: "pointermove",
            end: "pointerup",
            cancel: "pointercancel",
          },
          touch: {
            move: "touchmove",
            end: "touchend",
            cancel: "touchcancel",
          },
          mouse: {
            move: "mousemove",
            end: "mouseup",
            cancel: "mouseleave",
          },
        };

        function isSettingsMobileView() {
          try {
            return settingsMobileMQ.matches;
          } catch (_) {
            return false;
          }
        }

        function clearSettingsSheetTimeout() {
          if (settingsSheetCloseTimeout) {
            clearTimeout(settingsSheetCloseTimeout);
            settingsSheetCloseTimeout = null;
          }
        }

        function resetSheetTransforms() {
          if (!modalContentEl) return;
          modalContentEl.style.transition = "";
          modalContentEl.style.transform = "";
        }

        function getSettingsDragClientY(event) {
          if (event?.touches?.length) {
            return event.touches[0].clientY;
          }
          if (event?.changedTouches?.length) {
            return event.changedTouches[0].clientY;
          }
          return typeof event?.clientY === "number" ? event.clientY : null;
        }

        function attachSettingsDragListeners(type) {
          settingsDragEventType = type;
          const map =
            SETTINGS_DRAG_EVENTS[type] || SETTINGS_DRAG_EVENTS.pointer;
          const moveOptions = type === "touch" ? { passive: false } : undefined;
          window.addEventListener(
            map.move,
            handleSettingsDragMove,
            moveOptions
          );
          window.addEventListener(map.end, handleSettingsDragEnd);
          if (map.cancel && map.cancel !== map.end) {
            window.addEventListener(map.cancel, handleSettingsDragEnd);
          }
        }

        function detachSettingsDragListeners() {
          if (!settingsDragEventType) return;
          const map =
            SETTINGS_DRAG_EVENTS[settingsDragEventType] ||
            SETTINGS_DRAG_EVENTS.pointer;
          window.removeEventListener(map.move, handleSettingsDragMove);
          window.removeEventListener(map.end, handleSettingsDragEnd);
          if (map.cancel && map.cancel !== map.end) {
            window.removeEventListener(map.cancel, handleSettingsDragEnd);
          }
          settingsDragEventType = null;
        }

        // Resolve system theme if user selected 'system'
        function resolveTheme(preference) {
          if (preference === "system") {
            try {
              return window.matchMedia("(prefers-color-scheme: light)").matches
                ? "light"
                : "dark";
            } catch (_) {
              return "dark";
            }
          }
          return preference || "dark";
        }

        // Initialize saved values
        const savedThemePref = localStorage.getItem("theme") || "dark";
        const effectiveTheme = resolveTheme(savedThemePref);
        document.documentElement.setAttribute("data-theme", effectiveTheme);
        const savedSummary = localStorage.getItem("summary_model") || "ollama";
        const savedSentiment =
          localStorage.getItem("sentiment_model") || "roberta";
        if (summarySel) summarySel.value = savedSummary;
        if (sentimentSel) sentimentSel.value = savedSentiment;
        // Set theme card active state
        if (themeCards) {
          themeCards.querySelectorAll("[data-theme-option]").forEach((btn) => {
            btn.classList.toggle(
              "active",
              btn.getAttribute("data-theme-option") === savedThemePref
            );
          });
        }

        // Preload selected sentiment model on every page load
        if (savedSentiment) {
          try {
            loadSentimentModel(savedSentiment);
          } catch (_e) {}
        }

        function open() {
          if (!modal || modal.style.display === "flex") return;
          clearSettingsSheetTimeout();
          modal.style.display = "flex";
          lockBodyScroll();
          if (modalContentEl) {
            modalContentEl.classList.remove("is-sheet-active");
            resetSheetTransforms();
          }
          // Default to sidebar view on open for mobile
          if (settingsContent)
            settingsContent.setAttribute("data-view", "sidebar");
          if (settingsLayout)
            settingsLayout.setAttribute("data-view", "sidebar");
          // Restore last tab only on non-mobile; clear highlights on mobile
          try {
            const isMobileTabs =
              window.matchMedia("(max-width: 720px)").matches;
            if (!isMobileTabs) {
              const savedTab =
                localStorage.getItem("settings_active_tab") || "appearance";
              if (typeof window.__activateSettingsTab === "function") {
                window.__activateSettingsTab(savedTab, {
                  skipMobilePanel: true,
                });
              }
            } else {
              const tabs = document.querySelectorAll(".settings-tab");
              const panels = document.querySelectorAll(".settings-panel");
              tabs.forEach((t) => {
                t.classList.remove("active");
                t.setAttribute("aria-selected", "false");
              });
              panels.forEach((p) => {
                p.classList.remove("active");
                p.setAttribute("aria-hidden", "true");
              });
            }
          } catch (_) {}

          if (isSettingsMobileView() && modalContentEl) {
            requestAnimationFrame(() =>
              modalContentEl.classList.add("is-sheet-active")
            );
          }
        }
        function close() {
          if (!modal || modal.style.display !== "flex") return;
          clearSettingsSheetTimeout();
          const finish = () => {
            if (modalContentEl) {
              modalContentEl.classList.remove("is-sheet-active");
              resetSheetTransforms();
            }
            modal.style.display = "none";
            unlockBodyScroll();
          };

          if (isSettingsMobileView() && modalContentEl) {
            modalContentEl.classList.remove("is-sheet-active");
            settingsSheetCloseTimeout = setTimeout(() => {
              settingsSheetCloseTimeout = null;
              finish();
            }, 280);
          } else {
            finish();
          }
        }
        if (btn && modal) btn.addEventListener("click", open);
        if (closeX) closeX.addEventListener("click", close);
        if (modal)
          modal.addEventListener("click", (e) => {
            if (e.target === modal) close();
          });

        // Close settings modal on Esc
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && modal && modal.style.display === "flex") {
            close();
          }
        });

        function isSettingsDragHandle(target) {
          if (!target) return false;
          return Boolean(
            target.closest(".settings-drag-handle") ||
              target.closest(".modal-header")
          );
        }

        function handleSettingsDragStart(event) {
          if (
            !modal ||
            modal.style.display !== "flex" ||
            !isSettingsMobileView() ||
            !modalContentEl
          ) {
            return;
          }
          if (!isSettingsDragHandle(event.target)) {
            return;
          }
          const startY = getSettingsDragClientY(event);
          if (typeof startY !== "number") return;
          settingsSheetDragTracking = true;
          settingsSheetDragActive = false;
          settingsSheetDragStart = startY;
          const dragType = event.type.startsWith("touch")
            ? "touch"
            : event.type.startsWith("mouse")
            ? "mouse"
            : event.pointerType === "touch"
            ? "touch"
            : event.pointerType === "mouse"
            ? "mouse"
            : "pointer";
          if (dragType === "pointer" && event.pointerId != null) {
            settingsSheetCapturedPointer = event.pointerId;
            modalContentEl.setPointerCapture?.(event.pointerId);
          } else {
            settingsSheetCapturedPointer = null;
          }
          attachSettingsDragListeners(dragType);
        }

        function handleSettingsDragMove(event) {
          if (!settingsSheetDragTracking || !modalContentEl) return;
          const currentY = getSettingsDragClientY(event);
          if (typeof currentY !== "number") return;
          const delta = Math.max(0, currentY - settingsSheetDragStart);
          if (!settingsSheetDragActive) {
            if (delta < SETTINGS_SHEET_ACTIVATE_DELTA) return;
            settingsSheetDragActive = true;
            modalContentEl.style.transition = "none";
          }
          if (settingsDragEventType === "touch" && event.cancelable) {
            event.preventDefault();
          }
          modalContentEl.style.transform = `translateY(${delta}px)`;
        }

        function handleSettingsDragEnd(event) {
          if (!settingsSheetDragTracking || !modalContentEl) return;
          const currentY =
            getSettingsDragClientY(event) ?? settingsSheetDragStart;
          const delta = Math.max(0, currentY - settingsSheetDragStart);
          settingsSheetDragTracking = false;
          const dragType = settingsDragEventType;
          detachSettingsDragListeners();
          if (!settingsSheetDragActive) {
            return;
          }
          settingsSheetDragActive = false;
          modalContentEl.style.transition = "";
          modalContentEl.style.transform = "";
          if (dragType === "pointer" && settingsSheetCapturedPointer != null) {
            if (
              modalContentEl.hasPointerCapture?.(settingsSheetCapturedPointer)
            ) {
              modalContentEl.releasePointerCapture(
                settingsSheetCapturedPointer
              );
            }
            settingsSheetCapturedPointer = null;
          }
          if (delta > SETTINGS_SHEET_CLOSE_DELTA) {
            close();
          } else if (isSettingsMobileView()) {
            requestAnimationFrame(() =>
              modalContentEl.classList.add("is-sheet-active")
            );
          }
        }

        function attachSettingsSheetDragSource(target) {
          if (!target) return;
          if (window.PointerEvent) {
            target.addEventListener("pointerdown", handleSettingsDragStart, {
              passive: false,
            });
          } else {
            target.addEventListener("touchstart", handleSettingsDragStart, {
              passive: false,
            });
            target.addEventListener("mousedown", handleSettingsDragStart);
          }
        }

        attachSettingsSheetDragSource(modalContentEl);

        function handleSettingsBreakpoint() {
          if (!modalContentEl) return;
          resetSheetTransforms();
          if (!isSettingsMobileView()) {
            modalContentEl.classList.remove("is-sheet-active");
          } else if (modal.style.display === "flex") {
            requestAnimationFrame(() =>
              modalContentEl.classList.add("is-sheet-active")
            );
          }
        }

        if (settingsMobileMQ.addEventListener) {
          settingsMobileMQ.addEventListener("change", handleSettingsBreakpoint);
        } else if (settingsMobileMQ.addListener) {
          settingsMobileMQ.addListener(handleSettingsBreakpoint);
        }

        // Segmented theme control (Light / Dark / System)
        if (themeCards) {
          function applyTheme(pref) {
            localStorage.setItem("theme", pref);
            const themeToUse = resolveTheme(pref);
            document.documentElement.classList.add("theme-switching");
            document.documentElement.setAttribute("data-theme", themeToUse);
            requestAnimationFrame(() => {
              if (typeof updateChartsThemeColors === "function")
                updateChartsThemeColors();
              requestAnimationFrame(() => {
                document.documentElement.classList.remove("theme-switching");
              });
            });
          }
          // Initialize active card
          try {
            const savedPref = localStorage.getItem("theme") || "dark";
            themeCards
              .querySelectorAll("[data-theme-option]")
              .forEach((b) =>
                b.classList.toggle(
                  "active",
                  b.getAttribute("data-theme-option") === savedPref
                )
              );
          } catch (_) {}

          // Click handling
          themeCards.addEventListener("click", (e) => {
            const t = e.target.closest("[data-theme-option]");
            if (!t) return;
            const pref = t.getAttribute("data-theme-option");
            themeCards
              .querySelectorAll("[data-theme-option]")
              .forEach((b) => b.classList.toggle("active", b === t));
            applyTheme(pref);
          });
          // Respond to system theme changes when 'system' is selected
          try {
            const mql = window.matchMedia("(prefers-color-scheme: light)");
            mql.addEventListener("change", () => {
              const pref = localStorage.getItem("theme") || "dark";
              if (pref === "system") applyTheme("system");
              // Re-highlight correct card
              const current = localStorage.getItem("theme") || "dark";
              themeCards
                .querySelectorAll("[data-theme-option]")
                .forEach((b) =>
                  b.classList.toggle(
                    "active",
                    b.getAttribute("data-theme-option") === current
                  )
                );
            });
          } catch (_) {}
        }

        if (summarySel) {
          summarySel.addEventListener("change", (e) => {
            localStorage.setItem("summary_model", e.target.value);
          });
        }
        if (sentimentSel) {
          sentimentSel.addEventListener("change", async (e) => {
            const selectedModel = e.target.value;
            localStorage.setItem("sentiment_model", selectedModel);
            await loadSentimentModel(selectedModel);
          });
        }

        // Tabs inside settings modal
        (function initSettingsTabs() {
          const tabs = document.querySelectorAll(".settings-tab");
          const panels = document.querySelectorAll(".settings-panel");
          if (!tabs.length) return;
          function activate(name, { skipMobilePanel = false } = {}) {
            const isMobile = window.matchMedia("(max-width: 720px)").matches;
            tabs.forEach((t) => {
              if (isMobile) {
                // On mobile, never show active highlight state in the sidebar
                t.classList.remove("active");
                t.setAttribute("aria-selected", "false");
              } else {
                const isActive = t.getAttribute("data-tab") === name;
                t.classList.toggle("active", isActive);
                t.setAttribute("aria-selected", isActive ? "true" : "false");
              }
            });
            panels.forEach((p) => {
              const isActive = p.getAttribute("data-panel") === name;
              p.classList.toggle("active", isActive);
              p.setAttribute("aria-hidden", isActive ? "false" : "true");
            });
            // Persist last selected tab only on non-mobile
            try {
              if (!isMobile) localStorage.setItem("settings_active_tab", name);
            } catch (_) {}
            // On small screens switch to panel view and show title
            if (settingsContent && !skipMobilePanel) {
              if (isMobile) {
                settingsContent.setAttribute("data-view", "panel");
                if (settingsLayout)
                  settingsLayout.setAttribute("data-view", "panel");
                if (mobileTitle) {
                  const tab = Array.from(tabs).find(
                    (t) => t.getAttribute("data-tab") === name
                  );
                  const label = tab?.querySelector("span")?.textContent || name;
                  mobileTitle.textContent = label;
                }
              }
            }
          }
          tabs.forEach((t) =>
            t.addEventListener("click", () =>
              activate(t.getAttribute("data-tab"))
            )
          );

          // Expose activate for modal open initialization
          window.__activateSettingsTab = activate;

          // Initialize: desktop restores last tab; mobile clears highlight
          try {
            const isMobile = window.matchMedia("(max-width: 720px)").matches;
            if (!isMobile) {
              const savedTab =
                localStorage.getItem("settings_active_tab") || "appearance";
              activate(savedTab, { skipMobilePanel: true });
            }
          } catch (_) {}

          if (backBtn && settingsContent) {
            backBtn.addEventListener("click", () => {
              settingsContent.setAttribute("data-view", "sidebar");
              if (settingsLayout)
                settingsLayout.setAttribute("data-view", "sidebar");
            });
          }
        })();

        // Data controls actions
        if (clearWCBtn) {
          clearWCBtn.addEventListener("click", () => {
            try {
              clearWordcloudCache();
              clearWordcloudMemoryCache();
            } catch (_) {}
          });
        }
      })
      .catch((error) =>
        console.error("Settings modal unavailable:", error.message || error)
      );
  })();

  // Custom Selects (progressive enhancement)
  (function initCustomSelects() {
    function enhanceSelect(native, { compact = false } = {}) {
      if (!native || native.dataset.cs === "on") return;
      native.dataset.cs = "on";

      const baseLabel =
        native.getAttribute("aria-label") ||
        native.getAttribute("title") ||
        native.name ||
        native.id ||
        "Select option";
      const optionsList = Array.from(native.options);
      const selectedOption =
        native.selectedIndex >= 0
          ? optionsList[native.selectedIndex]
          : optionsList[0];
      const iconTrigger = native.dataset.iconTrigger === "true";

      // Wrapper
      const wrap = document.createElement("div");
      wrap.className = "cs" + (compact ? " cs-compact" : "");
      wrap.setAttribute("aria-expanded", "false");

      // Trigger
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "cs-trigger";
      if (iconTrigger) trigger.classList.add("cs-trigger-icon-only");
      trigger.setAttribute("aria-haspopup", "listbox");
      const valueSpan = document.createElement("span");
      valueSpan.className = "cs-value";
      const caretSpan = document.createElement("span");
      caretSpan.className = "cs-caret";
      let iconSpan;
      let srText;
      if (iconTrigger) {
        iconSpan = document.createElement("span");
        iconSpan.className = "cs-value-icon";
        valueSpan.appendChild(iconSpan);
        srText = document.createElement("span");
        srText.className = "sr-only";
        valueSpan.appendChild(srText);
      }
      trigger.appendChild(valueSpan);
      trigger.appendChild(caretSpan);

      const updateSelectedDisplay = (opt) => {
        const resolvedLabel = (opt?.text || "").trim() || baseLabel;
        if (iconTrigger) {
          if (iconSpan) {
            const iconPath = opt?.dataset.icon;
            if (iconPath) {
              iconSpan.style.setProperty(
                "--cs-icon-image",
                `url("${iconPath}")`
              );
              iconSpan.classList.remove("cs-value-icon--empty");
              iconSpan.textContent = "";
            } else {
              iconSpan.style.removeProperty("--cs-icon-image");
              iconSpan.classList.add("cs-value-icon--empty");
              const fallbackChar = resolvedLabel.charAt(0).toUpperCase() || "•";
              iconSpan.textContent = fallbackChar;
            }
          }
          if (srText) srText.textContent = resolvedLabel;
        } else {
          valueSpan.textContent = resolvedLabel;
        }
        trigger.setAttribute("aria-label", resolvedLabel);
      };

      updateSelectedDisplay(selectedOption);

      // Menu
      const menu = document.createElement("div");
      menu.className = "cs-menu";
      menu.setAttribute("role", "listbox");

      // Options
      optionsList.forEach((opt) => {
        const item = document.createElement("div");
        item.className = "cs-option";
        item.setAttribute("role", "option");
        const iconPath = opt.dataset.icon;
        if (iconPath) {
          const optionIcon = document.createElement("span");
          optionIcon.className = "cs-option-icon";
          optionIcon.style.setProperty("--cs-icon-image", `url("${iconPath}")`);
          item.appendChild(optionIcon);
        }
        const optionLabel = document.createElement("span");
        optionLabel.className = "cs-option-label";
        optionLabel.textContent = opt.text;
        item.appendChild(optionLabel);
        if (opt.disabled) item.setAttribute("aria-disabled", "true");
        if (opt.selected) item.setAttribute("aria-selected", "true");
        item.addEventListener("click", () => {
          if (opt.disabled) return;
          native.value = opt.value;
          updateSelectedDisplay(opt);
          // reflect selection in menu
          menu
            .querySelectorAll(".cs-option")
            .forEach((el) => el.removeAttribute("aria-selected"));
          item.setAttribute("aria-selected", "true");
          // fire change event for existing logic
          native.dispatchEvent(new Event("change", { bubbles: true }));
          wrap.setAttribute("aria-expanded", "false");
        });
        menu.appendChild(item);
      });

      // Wire trigger
      trigger.addEventListener("click", () => {
        const open = wrap.getAttribute("aria-expanded") === "true";
        // On open, decide direction based on viewport
        if (!open) {
          wrap.classList.remove("cs-up");
          const rect = wrap.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const estimatedMenuHeight = Math.min(
            320,
            Math.max(200, rect.height * 6)
          );
          if (
            spaceBelow < estimatedMenuHeight &&
            rect.top > estimatedMenuHeight
          ) {
            wrap.classList.add("cs-up");
          }
        }
        wrap.setAttribute("aria-expanded", open ? "false" : "true");
      });
      document.addEventListener("click", (e) => {
        if (!wrap.contains(e.target))
          wrap.setAttribute("aria-expanded", "false");
      });
      // Keyboard support
      trigger.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          wrap.setAttribute("aria-expanded", "true");
          const first = menu.querySelector('.cs-option[aria-disabled!="true"]');
          if (first) first.focus?.();
        }
      });

      // Build DOM
      native.classList.add("cs-native");
      const parent = native.parentNode;
      parent.insertBefore(wrap, native);
      wrap.appendChild(trigger);
      wrap.appendChild(menu);
      wrap.appendChild(native);

      native.addEventListener("change", () => {
        const current = native.options[native.selectedIndex];
        updateSelectedDisplay(current);
        menu
          .querySelectorAll(".cs-option")
          .forEach((el) => el.removeAttribute("aria-selected"));
        const idx = native.selectedIndex;
        if (idx >= 0) {
          const active = menu.children[idx];
          if (active) active.setAttribute("aria-selected", "true");
        }
      });
    }

    // Enhance known selects
    try {
      // Upload page: none
      // Dashboard
      if (location.pathname.endsWith("/frontend/dashboard.html")) {
        enhanceSelect(document.getElementById("filterSentiment"), {
          compact: true,
        });
        enhanceSelect(document.getElementById("chartType"), { compact: true });
      }
      // History
      if (location.pathname.endsWith("/frontend/history.html")) {
        enhanceSelect(document.getElementById("sortSelect"), { compact: true });
        enhanceSelect(document.getElementById("statusFilter"), {
          compact: true,
        });
      }
      // Settings (all pages) - wait for modal injection
      settingsModalReady.then(() => {
        const summarySelect = document.getElementById(
          "settingsSummarySelector"
        );
        const sentimentSelect = document.getElementById(
          "settingsSentimentSelector"
        );
        enhanceSelect(summarySelect);
        enhanceSelect(sentimentSelect);
      });
    } catch (_) {}
  })();
});

// Toast helpers (global)
function dismissToast(toast) {
  try {
    toast.style.animation = "toast-out 250ms ease forwards";
    setTimeout(() => toast.remove(), 240);
  } catch (_e) {
    toast.remove();
  }
}

function resetToastTimer(toast, ms) {
  if (toast._dismissTimer) clearTimeout(toast._dismissTimer);
  toast._dismissTimer = setTimeout(() => dismissToast(toast), ms);
}

// Cap concurrent toasts to 2 items (oldest auto-dismiss)
(function capToastsMaxTwo() {
  const origAppend = Element.prototype.appendChild;
  Element.prototype.appendChild = function () {
    const result = origAppend.apply(this, arguments);
    try {
      if (this.classList && this.classList.contains("toast-container")) {
        const toasts = this.querySelectorAll(".toast");
        if (toasts.length > 2) {
          // Dismiss oldest toasts until 2 remain
          const excess = toasts.length - 2;
          for (let i = 0; i < excess; i++) {
            dismissToast(toasts[i]);
          }
        }
      }
    } catch (_) {}
    return result;
  };
})();

// Mobile menu sync (CSS controls open/close via #checkbox)
(function initMobileMenu() {
  try {
    const checkbox = document.getElementById("checkbox");
    const menu = document.getElementById("mobileMenu");
    const settingsBtn = document.getElementById("mobileSettingsBtn");
    const label = document.querySelector('label.toggle[for="checkbox"]');
    if (!checkbox || !menu || !label) return;

    document.addEventListener("click", (e) => {
      if (
        !menu.contains(e.target) &&
        e.target !== checkbox &&
        !label.contains(e.target)
      ) {
        if (checkbox.checked) checkbox.checked = false;
      }
    });

    if (settingsBtn) {
      settingsBtn.addEventListener("click", () => {
        const btnSettings = document.getElementById("settingsBtn");
        if (btnSettings) btnSettings.click();
        checkbox.checked = false;
      });
    }
  } catch (_) {}
})();
