# 🧠 FeedBack Analyzer  
### Turn Raw Feedback into Actionable Intelligence

**FeedBack Analyzer** is a full-stack web application that transforms **unstructured textual feedback** into **clear, actionable insights**.  
It supports multi-file uploads, performs **local transformer-based sentiment analysis**, generates **AI-powered summaries**, visualizes insights with dashboards and word clouds, and exports professional **CSV and PDF reports** — all through a clean, modern UI.

---

## ✨ Key Highlights

- 📂 Upload feedback in **CSV, JSON, or TXT** formats  
- 🤖 **Local transformer-based sentiment analysis** (RoBERTa / DistilBERT)  
- 🧾 **AI summarization** using **Google Gemini** or **local Ollama models**  
- 📊 Interactive analytics dashboard with charts & statistics  
- ☁️ Word cloud generation  
- 📁 Full **analysis history** with re-open, export, and delete support  
- 📤 Export insights as **CSV** or **multi-page PDF reports**  
- 🎨 Modern, responsive UI with dark/light themes  

---

## 📚 Table of Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Getting Started](#getting-started)
6. [Configuration](#configuration)
7. [Running the Application](#running-the-application)
8. [Using the Web UI](#using-the-web-ui)
9. [API Overview](#api-overview)
10. [Data & Storage](#data--storage)
11. [Exports & Reporting](#exports--reporting)
12. [Screenshots](#screenshots)
13. [Development Notes](#development-notes)
14. [Troubleshooting](#troubleshooting)
15. [Future Improvements](#future-improvements)
16. [License](#license)

---

## 🚀 Features

### 📂 Multi-Format Upload
- Upload feedback from **CSV**, **JSON**, or **TXT** files  
- Supports **multiple files per analysis**  
- Automatically merges content into a unified dataset

---

### 🤖 Transformer-Based Sentiment Analysis
- Runs **locally** using Hugging Face transformer models
- Supported models:
  - `roberta`
  - `distilbert`
- Outputs:
  - Per-comment sentiment (`positive`, `neutral`, `negative`)
  - Confidence scores
  - Aggregated metrics for dashboards & reports

---

### 🧠 AI-Powered Summarization
- Generates concise summaries for long feedback
- Supported engines:
  - **Google Gemini API** (cloud)
  - **Ollama** (local LLMs such as `gemma3:7b`)
- Features:
  - Batched processing
  - Background execution
  - Streaming progress updates
  - Automatic retries for failed summaries

---

### 📊 Analytics Dashboard
- Sentiment distribution (bar & pie charts)
- Comment-level insights and summaries
- Key statistics & highlights
- Automatically generated **word cloud**

---

### 🕘 History & Analysis Management
- Every run is stored as a persistent **Analysis**
- View historical analyses with metadata
- Re-open, export, or delete previous analyses

---

### 📤 Exports & Reports
- **CSV Export**
  - Raw text
  - Cleaned text
  - Sentiment label & score
  - AI summary
- **PDF Report**
  - Multi-page professional report
  - Charts, tables, insights, and recommendations
  - Generated using `reportlab`

---

### 🎨 Modern Frontend
- Clean UI built with **HTML, CSS, and Vanilla JavaScript**
- Dark / Light theme toggle (persisted via `localStorage`)
- Loading states, progress indicators, and modals
- Fully responsive for modern browsers

---

## 🏗 Architecture

### Backend
- **FastAPI** REST API
- Local ML inference using Hugging Face
- Background summarization tasks
- CSV / PDF / Wordcloud generation
- SQLite persistence

### Frontend
- Static HTML pages served via FastAPI
- JavaScript-driven API interactions
- Charting via Chart.js, AmCharts, AnyChart

### Storage
- SQLite database for analyses & comments
- File-based assets and reports

---

## 🧰 Tech Stack

### Backend
- FastAPI
- Uvicorn
- SQLite
- Python-dotenv

### Machine Learning & AI
- Hugging Face Transformers
- PyTorch
- Google Gemini API
- Ollama (optional local LLMs)
- Pandas, NumPy

### Visualization & Reporting
- ReportLab (PDF)
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
│  ├─ app.py              # FastAPI application
│  ├─ db.py               # SQLite helpers
│  ├─ models.py           # Enums & constants
│  ├─ schemas.py          # API schemas
│  ├─ sentiment.py        # Transformer sentiment analysis
│  ├─ summarizer.py       # Gemini & Ollama summarizers
│  ├─ utils.py            # Parsing & helpers
│
├─ frontend/
│  ├─ index.html          # Upload UI
│  ├─ dashboard.html      # Analytics dashboard
│  ├─ history.html        # Analysis history
│  └─ static/
│     ├─ css/style.css
│     ├─ js/app.js
│     └─ assets/images/ui
│
├─ data/
│  └─ analyses.db         # SQLite database
│
├─ requirements.txt
├─ installer.bat
├─ launch.bat
└─ README.md
```

---

## 🧑‍💻 Getting Started

### Prerequisites
- Python **3.10+**
- Windows, Linux, or macOS
- *(Optional)* Ollama for local LLM summarization

---

### Clone the Repository
```bash
git clone https://github.com/sam-eer31/FeedBack_Analyzer.git
cd FeedBack_Analyzer
```

---

### Windows (Recommended)
```bash
installer.bat
launch.bat
```

---

### Manual Setup (Cross-Platform)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.app:app --reload
```

---

## ⚙️ Configuration

Create a `.env` file in the project root:

```env
GEMINI_API_KEY=your_api_key_here
HOST=0.0.0.0
PORT=8000
DATA_DIR=data
STATIC_DIR=frontend/static
MAX_BATCH_CHARS=18000
MAX_COMMENTS_PER_BATCH=40
```

---

## 🌐 Using the Web UI

- Upload feedback files
- Track analysis progress
- Explore dashboards
- Review historical analyses
- Export CSV & PDF reports
- View word clouds

Access via:
```
http://localhost:8000/frontend/index.html
```

---

## 🔌 API Overview

- `GET /health`
- `POST /analyses/upload`
- `GET /analyses`
- `GET /analyses/{id}`
- `DELETE /analyses/{id}`
- `GET /analyses/{id}/export.csv`
- `GET /analyses/{id}/export.pdf`
- `GET /analyses/{id}/wordcloud`

---

## 🗄 Data & Storage

- SQLite database (`data/analyses.db`)
- Stores analyses, comments, summaries, and metadata

---

## 📸 Screenshots

Below are key UI screens showcasing the main features of **FeedBack Analyzer**.  
Click any image to view it full-size on GitHub.

### Upload / Home Page
![Upload Page](frontend/static/assets/images/ui/index.html.png)

### Dashboard
![Dashboard](frontend/static/assets/images/ui/dashboard.html.png)

### Analysis History
![History](frontend/static/assets/images/ui/history.html.png)

### Preview Modal
![Preview Modal](frontend/static/assets/images/ui/preview_modal.png)

### Settings Modal
![Settings Modal](frontend/static/assets/images/ui/settings_modal.png)

### Word Cloud Visualization
![Wordcloud](frontend/static/assets/images/ui/wordcloud.png)

### Exported Reports
**CSV Export**  
![CSV Report](frontend/static/assets/images/ui/csv_report.png)

**PDF Export**  
![PDF Report](frontend/static/assets/images/ui/pdf_report.png)

---

## 🧪 Development Notes

- Handles BOM-prefixed `.env` keys on Windows
- Lazy-loads sentiment models
- Robust summarization retry mechanism
- Memory-aware batch processing

---

## 🛠 Troubleshooting

- Ensure `GEMINI_API_KEY` is set
- Check `/health` endpoint
- Retry failed summaries via API
- Reduce batch sizes for low-memory systems

---

## 🔮 Future Improvements

- User authentication & multi-tenant support
- Topic modeling & trend analysis
- API integrations (CRM, surveys, ticketing)
- Custom export templates
- Advanced sentiment tuning

---

## 📄 License

This project is licensed under the **MIT License**.
See the `LICENSE` file for details.
