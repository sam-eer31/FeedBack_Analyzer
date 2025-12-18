## FeedBack Analyzer

FeedBack Analyzer is an end-to-end web application that turns **raw textual feedback** into **actionable insights**.
It lets you upload feedback files (CSV, JSON, TXT), runs **local transformer-based sentiment analysis**, generates **AI summaries** (Gemini / Ollama), builds **word clouds**, and exports results as **CSV** and **PDF reports** – all wrapped in a clean, modern UI.

---

## ✨ Key Highlights

- 📂 **Multi-format uploads** — CSV, JSON, TXT (multiple files supported)
- 🤖 **Local transformer-based sentiment analysis** — RoBERTa / DistilBERT
- 🧠 **AI-powered summarization** — Google Gemini or local Ollama models
- 📊 **Interactive analytics dashboard** — charts, metrics, insights
- ☁️ **Automatic word cloud generation**
- 🕘 **Full analysis history** — view, re-open, export, delete
- 📤 **Professional exports** — CSV & multi-page PDF reports
- 🎨 **Modern responsive UI** — dark & light themes

---







## 📚 Table of Contents

1. [✨ Key Highlights](#-key-highlights)
2. [🚀 Key Features](#-key-features)
3. [🏗 Architecture Overview](#-architecture-overview)
4. [🧰 Tech Stack](#-tech-stack)
5. [📁 Project Structure](#-project-structure)
6. [🧑‍💻 Getting Started](#-getting-started)
7. [⚙️ Configuration](#-configuration)
8. [▶️ Running the Application](#️-running-the-application)
9. [🌐 Using the Web UI](#-using-the-web-ui)
10. [🔌 API Overview](#-api-overview)
11. [🗄 Data & Storage](#-data--storage)
12. [📸 Screenshots](#-screenshots)
13. [🧪 Development Notes](#-development-notes)
14. [🛠 Troubleshooting](#-troubleshooting)
15. [🔮 Future Improvements](#-future-improvements)
16. [📄 License](#-license)

---



## 🚀 Key Features

### Multi‑format upload

- Upload feedback from `CSV`, `JSON`, or `TXT` files
- Supports multiple files per analysis, automatically merged into a single dataset

### Transformer‑based sentiment analysis

- Uses **local Hugging Face transformer models** (e.g. RoBERTa / DistilBERT)
- Implemented via `transformers` and `torch`
- Produces per‑comment labels: `positive`, `neutral`, `negative`
- Aggregates counts and scores for dashboards, charts, and exports

### AI text summarization

- Generates concise summaries for long comments
- Primary summarizer: **Google Gemini API** (`google-genai`)
- Optional local summarizer: **Ollama** (e.g. `gemma3:7b`)
- Summarization is **batched and streamed** to keep the UI responsive

### Analytics dashboard

- Visualizes sentiment distribution (positive / neutral / negative)
- Displays comment‑level insights, summaries, and key statistics
- Generates a **wordcloud** image (PNG)

### History & management

- Every upload is stored as an **Analysis** record with metadata and timestamps
- Chronological history of analyses
- Re‑open, inspect, export, or delete past analyses

### Exports: CSV & PDF

- **CSV export**: original text, cleaned text, sentiment, score, summary
- **PDF export**: multi‑page “Feedback Intelligence Report” generated using `reportlab`

### Modern, responsive frontend

- Clean UI built with HTML, CSS, and vanilla JavaScript
- Dark / light theme toggle persisted via `localStorage`
- Loading states, modals, and progress indicators

### Admin & diagnostics

- Health check endpoint (`/health`) reporting summarizer status and env configuration
- Admin endpoints to reload environment variables and dynamically load sentiment models

---

## 🏗 Architecture Overview

### Backend (`backend/`)

- FastAPI application exposing REST APIs
- Local sentiment analysis using transformer models
- AI summarization orchestrated via FastAPI `BackgroundTasks`
- Server‑side CSV, PDF, and wordcloud generation

### Frontend (`frontend/`)

- Static HTML pages (`index.html`, `dashboard.html`, `history.html`)
- Frontend logic implemented in `app.js`
- Charts rendered using Chart.js, AmCharts, and AnyChart

### Storage (`data/`)

- SQLite database (`analyses.db`) storing analyses and comment‑level results

### ⚙️ Configuration

- Environment variables loaded from `.env` using `python-dotenv`

---

## 🧰 Tech Stack

### Backend

- FastAPI
- Uvicorn
- SQLite
- python‑dotenv

### Machine Learning & AI

- Hugging Face transformers
- PyTorch
- Google Gemini API (`google-genai`)
- Ollama (optional local LLMs)
- NumPy, Pandas

### Reporting & Visualization

- ReportLab (PDF generation)
- WordCloud
- Pillow

### Frontend

- HTML5, CSS3, Vanilla JavaScript
- Chart.js, AmCharts, AnyChart
- Font Awesome

---

## 📁 Project Structure

```text
FeedBack_Analyzer/
├─ backend/
│  ├─ app.py             # FastAPI app & API routes
│  ├─ db.py              # SQLite connection & helpers
│  ├─ models.py          # Enums (AnalysisStatus, SummaryStatus)
│  ├─ schemas.py         # Pydantic response models
│  ├─ sentiment.py       # Transformer-based sentiment analyzer
│  ├─ summarizer.py      # Gemini & Ollama summarizers
│  ├─ utils.py           # File parsing & helpers
│
├─ frontend/
│  ├─ index.html         # Upload UI
│  ├─ dashboard.html     # Analytics dashboard
│  ├─ history.html       # Analysis history
│  └─ static/
│     ├─ css/style.css
│     ├─ js/app.js
│     └─ assets/images/ui
│
├─ data/
│  └─ analyses.db
│
├─ requirements.txt
├─ installer.bat
├─ launch.bat
└─ README.md
```

---

## 🧑‍💻 Getting Started

### Prerequisites

- Python 3.10+
- Windows, Linux, or macOS
- Optional: Ollama for local summarization

### Clone the repository

```bash
git clone https://github.com/sam-eer31/FeedBack_Analyzer.git
cd FeedBack_Analyzer
```

### Windows one‑click install

```bash
installer.bat
```

### Manual setup (cross‑platform)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

---

## Configuration

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
HOST=0.0.0.0
PORT=8000
DATA_DIR=data
STATIC_DIR=frontend/static
MAX_BATCH_CHARS=18000
MAX_COMMENTS_PER_BATCH=40
```

Notes:
- BOM‑prefixed env keys are normalized on Windows
- `.env` can be reloaded via `/admin/reload_env`

---

## ▶️ Running the Application

### Using launch.bat (Windows)

```bash
launch.bat
```

### Manual Uvicorn

```bash
uvicorn backend.app:app --host 0.0.0.0 --port 8000 --reload
```

---

## 🌐 Using the Web UI

- Upload one or more feedback files
- Track sentiment and summarization progress
- Explore dashboards and insights
- View history and manage analyses
- Export CSV, PDF, and wordclouds

---

## 🔌 API Overview

### Health & admin

- `GET /health`
- `POST /admin/reload_env`
- `POST /admin/force_gemini`
- `POST /admin/load_sentiment_model`
- `GET /admin/sentiment_models_status`

### Analysis lifecycle

- `POST /analyses/upload`
- `GET /analyses`
- `GET /analyses/{analysis_id}`
- `DELETE /analyses/{analysis_id}`

### Summarization control

- `POST /analyses/{analysis_id}/summarize`
- `POST /analyses/{analysis_id}/retry-failed-summaries`

### Exports & assets

- `GET /analyses/{analysis_id}/export.csv`
- `GET /analyses/{analysis_id}/export.pdf`
- `GET /analyses/{analysis_id}/wordcloud`

---

## 🗄 Data & Storage

- SQLite database: `data/analyses.db`
- Stores analyses, comments, sentiment, summaries, and metadata

---

## 📸 Screenshots

<details open>
<summary><strong>📸 Application UI Overview</strong></summary>

<br/>

### Upload / Home
*Start a new analysis by uploading feedback files (CSV, JSON, TXT) and preview parsed content before processing.*

![Upload Page](frontend/static/assets/images/ui/index.html.png)

---

### Analytics Dashboard
*Visual overview of sentiment distribution, key metrics, summaries, and insights.*

![Dashboard](frontend/static/assets/images/ui/dashboard.html.png)

---

### Analysis History
*Chronological list of past analyses with status, metadata, and quick actions.*

![History](frontend/static/assets/images/ui/history.html.png)

---

### Preview Modal
*Inspect parsed feedback content before starting analysis.*

![Preview Modal](frontend/static/assets/images/ui/preview_modal.png)

---

### Settings & Configuration
*Configure sentiment models, summarization engines, and runtime options.*

![Settings Modal](frontend/static/assets/images/ui/settings_modal.png)

---

### Word Cloud Visualization
*Automatically generated word cloud from combined feedback and summaries.*

![Wordcloud](frontend/static/assets/images/ui/wordcloud.png)

---

### Exported Reports
*Professional exports for sharing and downstream analysis.*

**CSV Export**  
![CSV Report](frontend/static/assets/images/ui/csv_report.png)

**PDF Report**  
![PDF Report](frontend/static/assets/images/ui/pdf_report.png)

</details>

---

## 🧪 Development Notes

- Default sentiment model loaded at startup (`roberta`)
- Additional models are lazy‑loaded via admin endpoints
- Summarization is batched, streamed, and retried on failure

---

## 🛠 Troubleshooting

- Ensure `GEMINI_API_KEY` is set
- Check `/health` endpoint
- Retry failed summaries via API
- Reduce batch sizes for low‑memory systems

---

## 🔮 Future Improvements

- Authentication & multi‑tenant support
- Topic clustering and trend analysis
- API integrations (CRM, surveys, ticketing)
- Custom export templates

---

## 📄 License

MIT License
