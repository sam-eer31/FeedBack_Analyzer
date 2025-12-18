import os
import io
import json
import csv
import uuid
from datetime import datetime, timezone
from pathlib import Path
from statistics import mean
from typing import List, Dict, Any, Optional
from xml.sax.saxutils import escape

from dotenv import load_dotenv

# Ensure we load the .env from project root explicitly and override
ROOT_DIR = Path(__file__).resolve().parents[1]
DOTENV_PATH = ROOT_DIR / ".env"
load_dotenv(dotenv_path=str(DOTENV_PATH), override=True)

from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import base64

from .db import init_db, execute, executemany, fetchone, fetchall
from .models import AnalysisStatus, SummaryStatus
from .schemas import AnalysisOut, CommentOut
from .utils import parse_files_to_comments, clean_text, compute_sentiment_counts, safe_json_dumps
from .sentiment import SentimentAnalyzer
from .summarizer import GeminiSummarizer, OllamaSummarizer

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))
STATIC_DIR = os.getenv("STATIC_DIR", "frontend/static")
FRONTEND_DIR = "frontend"
DATA_DIR = os.getenv("DATA_DIR", "data")
LOG_DIR = os.getenv("LOG_DIR", "logs")


def _normalize_env_keys() -> None:
	# Handle potential BOM prefix on variable names from Windows-created .env
	keys = list(os.environ.keys())
	for k in keys:
		if k.startswith("\ufeff"):
			os.environ[k.lstrip("\ufeff")] = os.environ[k]
			del os.environ[k]
	# Also attempt to remap explicit BOM variant for GEMINI_API_KEY
	if not os.getenv("GEMINI_API_KEY") and os.getenv("\ufeffGEMINI_API_KEY"):
		os.environ["GEMINI_API_KEY"] = os.environ.get("\ufeffGEMINI_API_KEY", "")


_normalize_env_keys()

Path(DATA_DIR).mkdir(parents=True, exist_ok=True)
Path(LOG_DIR).mkdir(parents=True, exist_ok=True)

app = FastAPI(title="FeedBack Analyzer")
app.add_middleware(
	CORSMiddleware,
	allow_origins=["*"],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)

# Serve frontend under /frontend to avoid conflicting with API routes
if Path(FRONTEND_DIR).exists():
	app.mount("/frontend", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
# Serve static assets
if Path(STATIC_DIR).exists():
	app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
# Serve data directory for generated assets (e.g., wordclouds)
if Path(DATA_DIR).exists():
	app.mount("/data", StaticFiles(directory=DATA_DIR), name="data")

sentiment_analyzer: Optional[SentimentAnalyzer] = None
sentiment_analyzers: Dict[str, SentimentAnalyzer] = {}
summarizer: Optional[object] = None
summarizer_error: Optional[str] = None


@app.on_event("startup")
async def startup_event() -> None:
	init_db()
	global sentiment_analyzer, sentiment_analyzers, summarizer, summarizer_error
	# Load only the default sentiment analyzer (RoBERTa)
	try:
		sentiment_analyzers["roberta"] = SentimentAnalyzer("roberta")
		sentiment_analyzer = sentiment_analyzers["roberta"]  # Default
		print("✅ Default sentiment analyzer (RoBERTa) loaded successfully")
	except Exception as e:
		print(f"❌ Error loading default sentiment analyzer: {e}")
		sentiment_analyzer = None
	
	summarizer_error = None
	_normalize_env_keys()
	try:
		if os.getenv("GEMINI_API_KEY"):
			summarizer = GeminiSummarizer()
		else:
			summarizer = None
	except Exception as e:
		summarizer_error = str(e)
		summarizer = None


@app.get("/health")
def health() -> Dict[str, Any]:
	key = os.getenv("GEMINI_API_KEY") or ""
	return {
		"status": "ok",
		"summarizer": summarizer.__class__.__name__ if summarizer else None,
		"gemini_key_present": bool(key),
		"gemini_key_prefix": key[:4] if key else None,
		"dotenv_path": str(DOTENV_PATH),
		"summarizer_error": summarizer_error,
	}


@app.post("/admin/reload_env")
def reload_env():
	global summarizer, summarizer_error
	loaded = load_dotenv(dotenv_path=str(DOTENV_PATH), override=True)
	_normalize_env_keys()
	summarizer_error = None
	try:
		if os.getenv("GEMINI_API_KEY"):
			summarizer = GeminiSummarizer()
		else:
			summarizer = None
	except Exception as e:
		summarizer_error = str(e)
		summarizer = None
	return {"reloaded": bool(loaded), "summarizer": summarizer.__class__.__name__ if summarizer else None}


@app.post("/admin/force_gemini")
def force_gemini():
	global summarizer, summarizer_error
	_normalize_env_keys()
	try:
		summarizer = GeminiSummarizer()
		summarizer_error = None
		return {"ok": True, "summarizer": "GeminiSummarizer"}
	except Exception as e:
		summarizer_error = str(e)
		raise HTTPException(status_code=500, detail=f"Gemini init failed: {e}")


@app.post("/admin/load_sentiment_model")
def load_sentiment_model(model_type: str = Form(...)):
	global sentiment_analyzers
	if model_type not in ["roberta", "distilbert"]:
		raise HTTPException(status_code=400, detail="Invalid model type. Must be 'roberta' or 'distilbert'")
	
	if model_type in sentiment_analyzers:
		return {"ok": True, "model": model_type, "message": "Model already loaded"}
	
	try:
		print(f"🔄 Loading sentiment model: {model_type}")
		sentiment_analyzers[model_type] = SentimentAnalyzer(model_type)
		print(f"✅ Sentiment model {model_type} loaded successfully")
		return {"ok": True, "model": model_type, "message": "Model loaded successfully"}
	except Exception as e:
		print(f"❌ Error loading sentiment model {model_type}: {e}")
		raise HTTPException(status_code=500, detail=f"Failed to load model {model_type}: {e}")


@app.get("/admin/sentiment_models_status")
def get_sentiment_models_status():
	global sentiment_analyzers
	return {
		"loaded_models": list(sentiment_analyzers.keys()),
		"available_models": ["roberta", "distilbert"]
	}


@app.post("/analyses/upload")
async def upload_analysis(background_tasks: BackgroundTasks, files: List[UploadFile] = File(...), name: Optional[str] = Form(None), model_type: str = Form("gemini"), sentiment_model: str = Form("roberta")):
	if not files:
		raise HTTPException(status_code=400, detail="No files uploaded")

	analysis_id = str(uuid.uuid4())
	# Store UTC time with explicit 'Z' suffix for correct client parsing
	created_at = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
	
	# Generate default name from first file if no custom name provided
	if not name or name.strip() == "":
		first_file = files[0]
		first_filename = first_file.filename or "uploaded_file"
		# Remove extension from filename
		name = Path(first_filename).stem
	
	execute(
		"INSERT INTO analyses (id, name, created_at, status, total_comments, sentiment_model) VALUES (?, ?, ?, ?, ?, ?)",
		(analysis_id, name, created_at, AnalysisStatus.uploaded.value, 0, sentiment_model),
	)

	# Parse files into comments
	try:
		parsed = await parse_files_to_comments(files)
	except Exception as e:
		execute("UPDATE analyses SET status=? WHERE id=?", (AnalysisStatus.failed.value, analysis_id))
		raise HTTPException(status_code=400, detail=f"Failed to parse files: {e}")

	if not parsed:
		execute("UPDATE analyses SET status=? WHERE id=?", (AnalysisStatus.failed.value, analysis_id))
		raise HTTPException(status_code=400, detail="No valid comments found")

	# Use UTC with 'Z' for comment timestamps as well
	now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
	comment_rows = []
	for item in parsed:
		comment_id = str(uuid.uuid4())
		original = item["text"].strip()
		cleaned = clean_text(original)
		comment_rows.append(
			(
				comment_id,
				analysis_id,
				original,
				cleaned,
				None,
				None,
				None,
				SummaryStatus.pending.value,
				model_type,  # Store the model type
				now,
				item.get("file")
			)
		)

	executemany(
		"""
		INSERT INTO comments (
			id, analysis_id, original_text, cleaned_text, sentiment_label, sentiment_score, summary, summary_status, summary_model, created_at, external_file
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		""",
		comment_rows,
	)
	execute("UPDATE analyses SET total_comments=?, status=? WHERE id=?", (len(comment_rows), AnalysisStatus.processing.value, analysis_id))

	# Run fast local sentiment now with selected model
	global sentiment_analyzers
	if sentiment_model not in sentiment_analyzers:
		# Load the model if not already loaded
		try:
			print(f"🔄 Loading sentiment model {sentiment_model} for analysis...")
			sentiment_analyzers[sentiment_model] = SentimentAnalyzer(sentiment_model)
			print(f"✅ Sentiment model {sentiment_model} loaded successfully")
		except Exception as e:
			raise HTTPException(status_code=500, detail=f"Failed to load sentiment model '{sentiment_model}': {e}")
	
	current_sentiment_analyzer = sentiment_analyzers[sentiment_model]
	labels, scores = current_sentiment_analyzer.predict([row[2] for row in comment_rows])
	update_rows = []
	for i, row in enumerate(comment_rows):
		update_rows.append((labels[i], float(scores[i]), row[0]))
	executemany("UPDATE comments SET sentiment_label=?, sentiment_score=? WHERE id=?", update_rows)

	# Cache counts
	counts = compute_sentiment_counts(labels)
	execute("UPDATE analyses SET sentiment_counts=?, status=? WHERE id=?", (json.dumps(counts), AnalysisStatus.summarizing.value, analysis_id))

	# Start summarization (if available) - wordclouds are generated on-demand
	background_tasks.add_task(start_summarization_task, analysis_id)

	analysis_row = fetchone("SELECT * FROM analyses WHERE id=?", (analysis_id,))
	return JSONResponse(
		{
			"analysis": row_to_analysis_out(analysis_row),
			"initial_sentiment_counts": counts,
		}
	)




@app.get("/analyses")
def list_analyses():
	rows = fetchall("SELECT * FROM analyses ORDER BY created_at DESC")
	items = [row_to_analysis_out(r) for r in rows]
	return {"items": items, "total": len(items)}


@app.get("/analyses/{analysis_id}")
def get_analysis(analysis_id: str, offset: int = 0, limit: int = 100):
	analysis = fetchone("SELECT * FROM analyses WHERE id=?", (analysis_id,))
	if not analysis:
		raise HTTPException(status_code=404, detail="Analysis not found")
	analysis = dict(analysis)
	comments = fetchall(
		"SELECT * FROM comments WHERE analysis_id=? ORDER BY created_at LIMIT ? OFFSET ?",
		(analysis_id, limit, offset),
	)
	items = [row_to_comment_out(r) for r in comments]
	return {
		"analysis": row_to_analysis_out(analysis),
		"comments": items,
		"total": fetchone("SELECT COUNT(*) AS c FROM comments WHERE analysis_id=?", (analysis_id,))["c"],
	}


@app.delete("/analyses/{analysis_id}")
def delete_analysis(analysis_id: str):
	analysis = fetchone("SELECT id FROM analyses WHERE id=?", (analysis_id,))
	if not analysis:
		raise HTTPException(status_code=404, detail="Analysis not found")
	execute("DELETE FROM comments WHERE analysis_id=?", (analysis_id,))
	execute("DELETE FROM analyses WHERE id=?", (analysis_id,))
	return {"status": "deleted"}


@app.get("/analyses/{analysis_id}/export.csv")
def export_csv(analysis_id: str):
	analysis = fetchone("SELECT * FROM analyses WHERE id=?", (analysis_id,))
	if not analysis:
		raise HTTPException(status_code=404, detail="Analysis not found")
	rows = fetchall("SELECT * FROM comments WHERE analysis_id=? ORDER BY created_at", (analysis_id,))
	buffer = io.StringIO()
	writer = csv.writer(buffer)
	writer.writerow(["comment_id","original_text","cleaned_text","sentiment_label","sentiment_score","summary"]) 
	for r in rows:
		writer.writerow([
			r["id"], r["original_text"], r["cleaned_text"], r["sentiment_label"], r["sentiment_score"], r["summary"]
		])
	buffer.seek(0)
	return StreamingResponse(iter(["\ufeff" + buffer.getvalue()]), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=analysis_{analysis_id}.csv"})


@app.get("/analyses/{analysis_id}/export.pdf")
def export_pdf(analysis_id: str):
	from reportlab.lib import colors
	from reportlab.lib.pagesizes import A4
	from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
	from reportlab.lib.units import cm
	from reportlab.graphics.charts.barcharts import VerticalBarChart
	from reportlab.graphics.charts.piecharts import Pie
	from reportlab.graphics.shapes import Drawing, String
	from reportlab.platypus import (
		Image,
		KeepTogether,
		PageBreak,
		Paragraph,
		SimpleDocTemplate,
		Spacer,
		Table,
		TableStyle,
	)

	analysis = fetchone("SELECT * FROM analyses WHERE id=?", (analysis_id,))
	if not analysis:
		raise HTTPException(status_code=404, detail="Analysis not found")
	analysis = dict(analysis)
	try:
		meta = json.loads(analysis["meta"]) if analysis["meta"] else {}
	except Exception:
		meta = {}

	comments = fetchall(
		"SELECT original_text, summary, sentiment_label, sentiment_score, created_at FROM comments WHERE analysis_id=? ORDER BY created_at",
		(analysis_id,),
	)
	total_comments = analysis["total_comments"] or len(comments)

	raw_counts = json.loads(analysis["sentiment_counts"]) if analysis["sentiment_counts"] else {}
	counts = {key: int(raw_counts.get(key, 0) or 0) for key in ("positive", "neutral", "negative")}
	total_counts = sum(counts.values()) or total_comments or len(comments)

	def format_timestamp(value: Optional[str]) -> str:
		if not value:
			return "—"
		try:
			normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
			dt = datetime.fromisoformat(normalized)
			if dt.tzinfo is None:
				dt = dt.replace(tzinfo=timezone.utc)
			return dt.astimezone(timezone.utc).strftime("%d %b %Y • %H:%M UTC")
		except Exception:
			return value

	def fmt_percent(value: Optional[float]) -> str:
		if value is None:
			return "—"
		return f"{value:.1f}%"

	def fmt_score(value: Optional[float]) -> str:
		if value is None:
			return "—"
		return f"{value:.2f}"

	def summarize_text(text: Optional[str], max_chars: int = 220) -> str:
		if not text:
			return "—"
		text = " ".join(text.split())
		return text if len(text) <= max_chars else text[: max_chars - 1] + "…"

	def sentiment_ratio(label: str) -> float:
		if not total_counts:
			return 0.0
		return (counts.get(label, 0) / total_counts) * 100

	score_values = [c["sentiment_score"] for c in comments if c["sentiment_score"] is not None]
	score_by_label: Dict[str, Optional[float]] = {}
	for label in ("positive", "neutral", "negative"):
		label_scores = [c["sentiment_score"] for c in comments if c["sentiment_label"] == label and c["sentiment_score"] is not None]
		score_by_label[label] = mean(label_scores) if label_scores else None
	overall_score = mean(score_values) if score_values else None

	def select_comments(label: str, reverse: bool = True, limit: int = 3) -> List[Dict[str, Any]]:
		filtered = [
			{
				"text": summarize_text((row["summary"] or row["original_text"] or "").strip()),
				"score": row["sentiment_score"],
				"label": row["sentiment_label"],
			}
			for row in comments
			if row["sentiment_label"] == label and (row["summary"] or row["original_text"])
		]
		def sort_key(entry: Dict[str, Any]) -> float:
			score = entry["score"]
			if score is None:
				return float("-inf") if reverse else float("inf")
			return float(score)

		filtered.sort(key=sort_key, reverse=reverse)
		return filtered[:limit]

	top_positive = select_comments("positive", reverse=True)
	top_neutral = select_comments("neutral", reverse=True)
	top_negative = select_comments("negative", reverse=False)

	insights: List[str] = []
	if total_counts:
		if counts["positive"] >= counts["negative"] * 1.5:
			insights.append(f"Positive feedback dominates the dataset ({fmt_percent(sentiment_ratio('positive'))} of responses).")
		if counts["negative"] > 0:
			diff = counts["negative"] - counts["positive"]
			if diff > 0:
				insights.append("Negative sentiment currently exceeds positive responses—investigate recurring blockers.")
			elif sentiment_ratio("negative") >= 25:
				insights.append("A quarter of responses are negative, signaling areas that need attention.")
		if counts["neutral"] > total_counts * 0.35:
			insights.append("Large neutral share suggests opportunities to ask more targeted questions.")
	if overall_score is not None:
		if overall_score >= 0.65:
			insights.append("Average sentiment score indicates a consistently favorable experience.")
		elif overall_score <= 0.35:
			insights.append("Overall sentiment skews negative—prioritize quick wins to rebuild trust.")
	if not insights:
		insights.append("Sentiment mix is balanced; maintain momentum while addressing emerging themes.")

	def build_recommendations() -> List[str]:
		recs: List[str] = []
		if top_positive:
			recs.append("Amplify what works: highlight positive themes in upcoming communications.")
		if top_negative:
			recs.append("Address the most frequent negative point directly with a dedicated action plan.")
		if meta.get("summary_model_name"):
			recs.append(f"Summaries powered by {meta['summary_model_name']}—monitor quality as volume grows.")
		if not recs:
			recs.append("Continue collecting feedback to strengthen longitudinal insight.")
		return recs

	recommendations = build_recommendations()

	buf = io.BytesIO()
	doc = SimpleDocTemplate(
		buf,
		pagesize=A4,
		leftMargin=2 * cm,
		rightMargin=2 * cm,
		topMargin=2 * cm,
		bottomMargin=2 * cm,
		title="Feedback Analysis Report",
	)

	styles = getSampleStyleSheet()
	styles.add(
		ParagraphStyle(
			name="ReportTitle",
			parent=styles["Heading1"],
			fontSize=20,
			leading=24,
			textColor=colors.HexColor("#111827"),
			spaceAfter=6,
		)
	)
	styles.add(
		ParagraphStyle(
			name="ReportSubtitle",
			parent=styles["BodyText"],
			fontSize=11,
			textColor=colors.HexColor("#4B5563"),
			spaceAfter=16,
		)
	)
	styles.add(
		ParagraphStyle(
			name="SectionHeading",
			parent=styles["Heading2"],
			fontSize=14,
			leading=18,
			textColor=colors.HexColor("#0F172A"),
			spaceBefore=12,
			spaceAfter=8,
		)
	)
	if "ReportBullet" not in styles:
		styles.add(
			ParagraphStyle(
				name="ReportBullet",
				parent=styles["BodyText"],
				leftIndent=12,
				bulletIndent=0,
				spaceAfter=4,
			)
		)
	if "ReportSmallLabel" not in styles:
		styles.add(
			ParagraphStyle(
				name="ReportSmallLabel",
				parent=styles["BodyText"],
				fontSize=9,
				textColor=colors.HexColor("#6B7280"),
			)
		)

	story: List[Any] = []

	logo_path = ROOT_DIR / "frontend" / "static" / "assets" / "images" / "logo.png"
	if "ReportHeroTitle" not in styles:
		styles.add(
			ParagraphStyle(
				name="ReportHeroTitle",
				parent=styles["Heading1"],
				fontSize=22,
				leading=26,
				textColor=colors.HexColor("#0F172A"),
			)
		)

	if logo_path.exists():
		logo_flowable = Image(str(logo_path))
		logo_flowable.hAlign = "LEFT"
		logo_flowable._restrictSize(4 * cm, 4 * cm)

		header_table = Table(
			[
				[
					logo_flowable,
					Paragraph("Feedback Intelligence Report", styles["ReportHeroTitle"]),
				]
			],
			colWidths=[logo_flowable.drawWidth + 0.2 * cm, doc.width - (logo_flowable.drawWidth + 0.2 * cm)],
			style=TableStyle(
				[
					("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
					("ALIGN", (0, 0), (0, -1), "LEFT"),
					("ALIGN", (1, 0), (1, -1), "LEFT"),
					("LEFTPADDING", (0, 0), (-1, -1), 0),
					("RIGHTPADDING", (0, 0), (-1, -1), 0),
					("TOPPADDING", (0, 0), (-1, -1), 0),
					("BOTTOMPADDING", (0, 0), (-1, -1), 6),
				]
			),
		)
		story.append(header_table)
	else:
		story.append(Paragraph("Feedback Intelligence Report", styles["ReportHeroTitle"]))

	metadata_table = Table(
		[
			["File", escape(analysis.get("name") or "Untitled Analysis")],
			["Created", format_timestamp(analysis.get("created_at"))],
			["Status", analysis.get("status", "—").title() if analysis.get("status") else "—"],
			["Total Comments", f"{total_comments or total_counts}"],
			["Sentiment Model", analysis.get("sentiment_model") or "roberta"],
			["Summary Model", meta.get("summary_model_name") or meta.get("summary_model") or "—"],
		],
		colWidths=[5 * cm, 10 * cm],
		style=TableStyle(
			[
				("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F3F4F6")),
				("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#4B5563")),
				("TEXTCOLOR", (1, 0), (1, -1), colors.HexColor("#111827")),
				("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
				("FONTSIZE", (0, 0), (-1, -1), 10),
				("ALIGN", (0, 0), (-1, -1), "LEFT"),
				("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
				("ROWSPACING", (0, 0), (-1, -1), 6),
				("INNERGRID", (0, 0), (-1, -1), 0.25, colors.white),
				("BOX", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
			]
		),
	)
	story.append(metadata_table)

	story.append(Paragraph("Sentiment Overview", styles["SectionHeading"]))

	sentiment_table = Table(
		[
			["Sentiment", "Count", "Share", "Avg. score"],
			["Positive", counts["positive"], fmt_percent(sentiment_ratio("positive")), fmt_score(score_by_label["positive"])],
			["Neutral", counts["neutral"], fmt_percent(sentiment_ratio("neutral")), fmt_score(score_by_label["neutral"])],
			["Negative", counts["negative"], fmt_percent(sentiment_ratio("negative")), fmt_score(score_by_label["negative"])],
		],
		colWidths=[5 * cm, 3 * cm, 3 * cm, 4 * cm],
		style=TableStyle(
			[
				("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F2937")),
				("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
				("BACKGROUND", (0, 1), (-1, -1), colors.HexColor("#F9FAFB")),
				("ALIGN", (1, 1), (-1, -1), "CENTER"),
				("ALIGN", (0, 0), (0, -1), "LEFT"),
				("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
				("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
				("FONTSIZE", (0, 0), (-1, -1), 10),
				("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F3F4F6")]),
				("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
				("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
			]
		),
	)
	story.append(sentiment_table)

	if overall_score is not None:
		story.append(
			Paragraph(
				f"Overall sentiment score: <b>{fmt_score(overall_score)}</b>",
				styles["BodyText"],
			)
		)

	def build_sentiment_chart() -> Drawing:
		is_binary = (analysis.get("sentiment_model") or "").lower() == "distilbert"
		palette = {
			"positive": colors.HexColor("#34d399"),
			"neutral": colors.HexColor("#94a3b8"),
			"negative": colors.HexColor("#f87171"),
			"axis": colors.HexColor("#94a3b8"),
			"grid": colors.Color(148 / 255, 163 / 255, 184 / 255, alpha=0.2),
		}
		if is_binary:
			labels = ["Positive", "Negative"]
			values = [counts.get("positive", 0), counts.get("negative", 0)]
			color_sequence = [palette["positive"], palette["negative"]]
		else:
			labels = ["Positive", "Neutral", "Negative"]
			values = [
				counts.get("positive", 0),
				counts.get("neutral", 0),
				counts.get("negative", 0),
			]
			color_sequence = [palette["positive"], palette["neutral"], palette["negative"]]

		max_value = max(values) if any(values) else 0
		value_max = max_value + max(1, int(max_value * 0.2)) if max_value else 1
		value_step = max(1, int(round(value_max / 4))) if value_max > 1 else 1

		chart_height = 7 * cm
		chart_width = doc.width
		drawing = Drawing(chart_width, chart_height)
		chart = VerticalBarChart()
		chart.x = 40
		chart.y = 25
		chart.height = chart_height - 45
		chart.width = chart_width - 80
		chart.data = [values]
		chart.strokeColor = colors.HexColor("#E5E7EB")
		chart.barSpacing = 0.3
		chart.groupSpacing = 8
		chart.categoryAxis.categoryNames = labels
		chart.categoryAxis.labels.fontName = "Helvetica"
		chart.categoryAxis.labels.fontSize = 9
		chart.categoryAxis.labels.fillColor = palette["axis"]
		chart.valueAxis.labels.fontName = "Helvetica"
		chart.valueAxis.labels.fontSize = 9
		chart.valueAxis.labels.fillColor = palette["axis"]
		chart.valueAxis.rangeRound = "both"
		chart.valueAxis.valueMin = 0
		chart.valueAxis.valueMax = value_max
		chart.valueAxis.valueStep = value_step
		chart.valueAxis.visibleGrid = True
		chart.valueAxis.gridStrokeColor = palette["grid"]
		chart.valueAxis.gridStrokeWidth = 0.5
		chart.valueAxis.strokeColor = palette["axis"]

		for idx in range(len(values)):
			chart.bars[(0, idx)].fillColor = color_sequence[idx % len(color_sequence)]
			chart.bars[(0, idx)].strokeColor = colors.white
			chart.bars[(0, idx)].strokeWidth = 0.6

		chart.barLabelFormat = "%d"
		chart.barLabels.fontName = "Helvetica-Bold"
		chart.barLabels.fontSize = 9
		chart.barLabels.fillColor = colors.HexColor("#0f172a")
		chart.barLabels.dy = -6

		drawing.add(chart)
		return drawing

	sentiment_chart = build_sentiment_chart()

	story.append(Paragraph("Insights", styles["SectionHeading"]))
	for point in insights:
		story.append(Paragraph(f"• {escape(point)}", styles["ReportBullet"]))

	story.append(Paragraph("Recommended Next Actions", styles["SectionHeading"]))
	for rec in recommendations:
		story.append(Paragraph(f"• {escape(rec)}", styles["ReportBullet"]))

	# Wordcloud section
	wordcloud_flowable = None
	try:
		from wordcloud import WordCloud

		all_text = []
		for comment in comments:
			if comment["original_text"]:
				all_text.append(comment["original_text"])
			if comment["summary"]:
				all_text.append(comment["summary"])
		if all_text:
			wc = WordCloud(width=1600, height=900, background_color="white").generate("\n".join(all_text))
			img_buffer = io.BytesIO()
			wc.to_image().save(img_buffer, format="PNG")
			img_buffer.seek(0)
			cloud_width = doc.width * 0.8
			wordcloud_flowable = Image(
				img_buffer,
				width=cloud_width,
				height=cloud_width * 0.5,
			)
			wordcloud_flowable.hAlign = "CENTER"
	except Exception:
		wordcloud_flowable = None

	# Page 1: intro, overview, insights, recommendations already added above
	story.append(PageBreak())

	def build_sentiment_pie() -> Drawing:
		is_binary = (analysis.get("sentiment_model") or "").lower() == "distilbert"
		if is_binary:
			labels = ["Positive", "Negative"]
			values = [counts.get("positive", 0), counts.get("negative", 0)]
			colors_seq = [colors.HexColor("#34d399"), colors.HexColor("#f87171")]
		else:
			labels = ["Positive", "Neutral", "Negative"]
			values = [
				counts.get("positive", 0),
				counts.get("neutral", 0),
				counts.get("negative", 0),
			]
			colors_seq = [
				colors.HexColor("#34d399"),
				colors.HexColor("#94a3b8"),
				colors.HexColor("#f87171"),
			]

		drawing = Drawing(doc.width, 6 * cm)
		pie = Pie()
		pie.width = 6 * cm
		pie.height = 6 * cm
		pie.x = (doc.width - pie.width) / 2
		pie.y = 0
		pie.data = values
		pie.labels = [f"{label} ({value})" for label, value in zip(labels, values)]
		for i, color in enumerate(colors_seq):
			pie.slices[i].fillColor = color
			pie.slices[i].strokeColor = colors.white
			pie.slices[i].strokeWidth = 0.5
		pie.simpleLabels = False
		pie.sideLabels = True

		drawing.add(pie)
		return drawing

	sentiment_pie = build_sentiment_pie()

	# Page 2: visuals (pie, bar, wordcloud)
	story.append(Paragraph("Visual Sentiment Summary", styles["SectionHeading"]))
	story.append(sentiment_pie)
	caption_style = ParagraphStyle(
		name="CenteredCaption",
		parent=styles["ReportSmallLabel"],
		alignment=1,
	)

	story.append(Paragraph("<i>Figure 1. Sentiment composition across classes.</i>", caption_style))
	story.append(Spacer(1, 0.6 * cm))
	story.append(sentiment_chart)
	story.append(Paragraph("<i>Figure 2. Distribution of sentiment counts.</i>", caption_style))
	story.append(Spacer(1, 0.6 * cm))
	if wordcloud_flowable:
		story.append(wordcloud_flowable)
		story.append(Paragraph("<i>Figure 3. Dominant phrases from comments and summaries.</i>", caption_style))
	else:
		story.append(Paragraph("Word cloud unavailable (insufficient text).", styles["BodyText"]))

	story.append(PageBreak())

	story.append(Paragraph("Comments & Summaries", styles["SectionHeading"]))
	comment_rows = [["Sentiment", "Score", "Summary", "Original Comment"]]
	for row in comments:
		comment_rows.append(
			[
				(row["sentiment_label"] or "—").title() if row["sentiment_label"] else "—",
				fmt_score(row["sentiment_score"]),
				Paragraph(escape(summarize_text(row["summary"])), styles["BodyText"]),
				Paragraph(escape(summarize_text(row["original_text"], max_chars=160)), styles["BodyText"]),
			]
		)
	if len(comment_rows) == 1:
		comment_rows.append(["—", "—", Paragraph("No summaries available.", styles["BodyText"]), Paragraph("—", styles["BodyText"])])

	all_comments_table = Table(
		comment_rows,
		colWidths=[3 * cm, 2.2 * cm, 5.5 * cm, 6.3 * cm],
		style=TableStyle(
			[
				("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#111827")),
				("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
				("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
				("VALIGN", (0, 0), (-1, -1), "TOP"),
				("FONTSIZE", (0, 0), (-1, -1), 9),
				("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F9FAFB")]),
				("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#E5E7EB")),
				("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E5E7EB")),
			]
		),
		repeatRows=1,
	)
	story.append(all_comments_table)


	generated_at = datetime.utcnow().strftime("%d %b %Y • %H:%M UTC")

	def draw_footer(canvas_obj, doc_obj):
		canvas_obj.saveState()
		canvas_obj.setFont("Helvetica", 9)
		canvas_obj.setFillColor(colors.HexColor("#6B7280"))
		canvas_obj.drawString(doc_obj.leftMargin, 1.2 * cm, f"Generated {generated_at}")
		canvas_obj.drawRightString(doc_obj.pagesize[0] - doc_obj.rightMargin, 1.2 * cm, f"Page {doc_obj.page}")
		canvas_obj.restoreState()

	doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)

	pdf_bytes = buf.getvalue()
	headers = {
		"Content-Disposition": f"attachment; filename=analysis_{analysis_id}.pdf",
		"Content-Length": str(len(pdf_bytes)),
	}
	return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)


@app.post("/analyses/{analysis_id}/summarize")
def trigger_summarize(background_tasks: BackgroundTasks, analysis_id: str):
	analysis = fetchone("SELECT * FROM analyses WHERE id= ?", (analysis_id,))
	if not analysis:
		raise HTTPException(status_code=404, detail="Analysis not found")
	background_tasks.add_task(start_summarization_task, analysis_id)
	return {"status": "started"}


@app.post("/analyses/{analysis_id}/retry-failed-summaries")
def retry_failed_summaries(background_tasks: BackgroundTasks, analysis_id: str):
	analysis = fetchone("SELECT * FROM analyses WHERE id= ?", (analysis_id,))
	if not analysis:
		raise HTTPException(status_code=404, detail="Analysis not found")
	
	# Count failed summaries
	failed_count = fetchone(
		"SELECT COUNT(*) AS c FROM comments WHERE analysis_id=? AND summary_status=?",
		(analysis_id, SummaryStatus.error.value),
	)["c"]
	
	if failed_count == 0:
		return {"status": "no_failed_summaries", "message": "No failed summaries to retry"}
	
	# Reset failed summaries to pending
	execute(
		"UPDATE comments SET summary_status=? WHERE analysis_id=? AND summary_status=?",
		(SummaryStatus.pending.value, analysis_id, SummaryStatus.error.value),
	)
	
	# Reset progress to 0 and set analysis status to summarizing
	meta = fetchone("SELECT meta FROM analyses WHERE id= ?", (analysis_id,))
	try:
		cur_meta = json.loads(meta["meta"]) if meta and meta["meta"] else {}
	except Exception:
		cur_meta = {}
	cur_meta["summarization_progress"] = 0  # Reset progress to 0
	# Clear any previous summarizer error so UI doesn't show stale errors during retry
	if "summarizer_error" in cur_meta:
		try:
			del cur_meta["summarizer_error"]
		except Exception:
			cur_meta["summarizer_error"] = None
	execute("UPDATE analyses SET status=?, meta=? WHERE id= ?", (AnalysisStatus.summarizing.value, json.dumps(cur_meta), analysis_id))
	
	background_tasks.add_task(start_summarization_task, analysis_id)
	return {"status": "retry_started", "failed_count": failed_count}


def start_summarization_task(analysis_id: str) -> None:
	# Get the model type from the first comment
	first_comment = fetchone("SELECT summary_model FROM comments WHERE analysis_id=? LIMIT 1", (analysis_id,))
	if not first_comment or not first_comment["summary_model"]:
		mark_summaries_unavailable(analysis_id)
		return
	
	model_type = first_comment["summary_model"]
	
	# Create the appropriate summarizer
	try:
		if model_type == "gemini":
			if not summarizer or not isinstance(summarizer, GeminiSummarizer):
				raise RuntimeError("Gemini summarizer not available")
			current_summarizer = summarizer
			print(f"🔍 APP DEBUG: Using Gemini summarizer")
		elif model_type == "ollama":
			print(f"🔍 APP DEBUG: Creating Ollama summarizer with model gemma3:1b")
			current_summarizer = OllamaSummarizer("gemma3:1b")
			print(f"🔍 APP DEBUG: Ollama summarizer created successfully")
		else:
			raise RuntimeError(f"Unknown model type: {model_type}")
	except Exception as e:
		# Mark all remaining pending as error and store error details in analysis meta
		executemany(
			"UPDATE comments SET summary_status=? WHERE analysis_id=? AND summary_status=?",
			[(SummaryStatus.error.value, analysis_id, SummaryStatus.pending.value)],
		)
		meta = fetchone("SELECT meta FROM analyses WHERE id=?", (analysis_id,))
		try:
			cur_meta = json.loads(meta["meta"]) if meta and meta["meta"] else {}
		except Exception:
			cur_meta = {}
		cur_meta["summarizer_error"] = str(e)
		# Ensure analysis is marked complete and progress shows as finished to stop UI loader
		cur_meta["summarization_progress"] = 100
		execute("UPDATE analyses SET status=?, meta=? WHERE id=?", (AnalysisStatus.done.value, json.dumps(cur_meta), analysis_id))
		return
	
	# Get total count for progress tracking
	total_comments = fetchone("SELECT COUNT(*) AS c FROM comments WHERE analysis_id=?", (analysis_id,))["c"]
	
	rows = fetchall(
		"SELECT id, original_text FROM comments WHERE analysis_id=? AND (summary IS NULL OR summary_status=?) ORDER BY created_at",
		(analysis_id, SummaryStatus.pending.value),
	)
	items = [(r["id"], r["original_text"]) for r in rows]
	items_to_process = len(items)
	print(f"🔍 APP DEBUG: Found {items_to_process} items to summarize for analysis {analysis_id} (total: {total_comments})")
	if not items:
		print("🔍 APP DEBUG: No items to summarize, returning")
		return
	# Stream batches to persist progressive results so UI updates incrementally
	try:
		print(f"🔍 APP DEBUG: Starting summarization with {current_summarizer.__class__.__name__}")
		completed_count = 0
		# Persist chosen summary model and resolved model name for UI display
		try:
			resolved_model_name = None
			if isinstance(current_summarizer, GeminiSummarizer):
				resolved_model_name = getattr(current_summarizer, "model", None)
				try:
					resolved_model_name = getattr(resolved_model_name, "model_name", None) or getattr(resolved_model_name, "_model", None) or None
				except Exception:
					pass
				if not resolved_model_name:
					# Fallback to env if SDK object doesn't expose the name
					resolved_model_name = os.getenv("GEMINI_MODEL")
			elif isinstance(current_summarizer, OllamaSummarizer):
				resolved_model_name = getattr(current_summarizer, "model_name", None)
			meta = fetchone("SELECT meta FROM analyses WHERE id=?", (analysis_id,))
			try:
				cur_meta = json.loads(meta["meta"]) if meta and meta["meta"] else {}
			except Exception:
				cur_meta = {}
			cur_meta["summary_model"] = model_type
			if resolved_model_name:
				cur_meta["summary_model_name"] = str(resolved_model_name)
			execute("UPDATE analyses SET meta=? WHERE id=?", (json.dumps(cur_meta), analysis_id))
		except Exception:
			pass
		
		if hasattr(current_summarizer, "summarize_in_batches_stream"):
			print("🔍 APP DEBUG: Using stream method")
			for batch_result in current_summarizer.summarize_in_batches_stream(items):
				print(f"🔍 APP DEBUG: Received batch result: {batch_result}")
				
				# Calculate batch success rate
				batch_success_count = sum(1 for out in batch_result.values() if out.get("ok"))
				batch_total_count = len(batch_result)
				batch_success_rate = batch_success_count / batch_total_count if batch_total_count > 0 else 0
				
				print(f"🔍 APP DEBUG: Batch success rate: {batch_success_count}/{batch_total_count} ({batch_success_rate:.1%})")
				
				# Only update database if batch has >= 90% success rate
				if batch_success_rate >= 0.9:
					print(f"✅ APP DEBUG: Batch success rate {batch_success_rate:.1%} >= 90%, updating database")
					
					ok_updates = []
					error_updates = []
					for cid, out in batch_result.items():
						if out.get("ok"):
							ok_updates.append((out["summary"], SummaryStatus.ok.value, cid))
							print(f"✅ APP DEBUG: Adding summary for {cid}: '{out['summary']}'")
						else:
							error_updates.append((SummaryStatus.error.value, cid))
							print(f"❌ APP DEBUG: Marking as failed: {cid} - {out.get('error', 'Unknown error')}")
					
					if ok_updates:
						print(f"🔍 APP DEBUG: Updating {len(ok_updates)} comments with summaries")
						executemany("UPDATE comments SET summary=?, summary_status=? WHERE id=?", ok_updates)
						completed_count += len(ok_updates)
					
					if error_updates:
						print(f"🔍 APP DEBUG: Marking {len(error_updates)} comments as failed")
						executemany("UPDATE comments SET summary_status=? WHERE id=?", error_updates)
						completed_count += len(error_updates)
					
					# Update progress in analysis meta - use items_to_process for accurate progress
					progress_percent = int((completed_count / items_to_process) * 100) if items_to_process > 0 else 0
					meta = fetchone("SELECT meta FROM analyses WHERE id=?", (analysis_id,))
					try:
						cur_meta = json.loads(meta["meta"]) if meta and meta["meta"] else {}
					except Exception:
						cur_meta = {}
					cur_meta["summarization_progress"] = progress_percent
					execute("UPDATE analyses SET meta=? WHERE id=?", (json.dumps(cur_meta), analysis_id))
					print(f"🔍 APP DEBUG: Progress: {completed_count}/{items_to_process} ({progress_percent}%)")
				else:
					print(f"⚠️ APP DEBUG: Batch success rate {batch_success_rate:.1%} < 90%, not updating database - will retry")
		else:
			print("🔍 APP DEBUG: Using non-stream method")
			results = current_summarizer.summarize_in_batches(items)
			print(f"🔍 APP DEBUG: Received results: {results}")
			
			# Calculate overall success rate
			success_count = sum(1 for out in results.values() if out.get("ok"))
			total_count = len(results)
			overall_success_rate = success_count / total_count if total_count > 0 else 0
			
			print(f"🔍 APP DEBUG: Overall success rate: {success_count}/{total_count} ({overall_success_rate:.1%})")
			
			# Only update database if overall success rate >= 90%
			if overall_success_rate >= 0.9:
				print(f"✅ APP DEBUG: Overall success rate {overall_success_rate:.1%} >= 90%, updating database")
				
				ok_updates = []
				error_updates = []
				for cid, out in results.items():
					if out.get("ok"):
						ok_updates.append((out["summary"], SummaryStatus.ok.value, cid))
						print(f"✅ APP DEBUG: Adding summary for {cid}: '{out['summary']}'")
					else:
						error_updates.append((SummaryStatus.error.value, cid))
						print(f"❌ APP DEBUG: Marking as failed: {cid} - {out.get('error', 'Unknown error')}")
				
				if ok_updates:
					print(f"🔍 APP DEBUG: Updating {len(ok_updates)} comments with summaries")
					executemany("UPDATE comments SET summary=?, summary_status=? WHERE id=?", ok_updates)
					completed_count += len(ok_updates)
				
				if error_updates:
					print(f"🔍 APP DEBUG: Marking {len(error_updates)} comments as failed")
					executemany("UPDATE comments SET summary_status=? WHERE id=?", error_updates)
					completed_count += len(error_updates)
				
				# Update progress in analysis meta - use items_to_process for accurate progress
				progress_percent = int((completed_count / items_to_process) * 100) if items_to_process > 0 else 0
				meta = fetchone("SELECT meta FROM analyses WHERE id=?", (analysis_id,))
				try:
					cur_meta = json.loads(meta["meta"]) if meta and meta["meta"] else {}
				except Exception:
					cur_meta = {}
				cur_meta["summarization_progress"] = progress_percent
				execute("UPDATE analyses SET meta=? WHERE id=?", (json.dumps(cur_meta), analysis_id))
				print(f"🔍 APP DEBUG: Progress: {completed_count}/{items_to_process} ({progress_percent}%)")
			else:
				print(f"⚠️ APP DEBUG: Overall success rate {overall_success_rate:.1%} < 90%, not updating database - will retry")
	except Exception as e:
		print(f"❌ APP ERROR: Exception during summarization: {e}")
		import traceback
		traceback.print_exc()
		# Mark all remaining pending as error and store error details in analysis meta
		executemany(
			"UPDATE comments SET summary_status=? WHERE analysis_id=? AND summary_status=?",
			[(SummaryStatus.error.value, analysis_id, SummaryStatus.pending.value)],
		)
		meta = fetchone("SELECT meta FROM analyses WHERE id=?", (analysis_id,))
		try:
			cur_meta = json.loads(meta["meta"]) if meta and meta["meta"] else {}
		except Exception:
			cur_meta = {}
		cur_meta["summarizer_error"] = str(e)
		execute("UPDATE analyses SET meta=? WHERE id=?", (json.dumps(cur_meta), analysis_id))
	# Mark any remaining pending summaries as failed
	remaining = fetchone(
		"SELECT COUNT(*) AS c FROM comments WHERE analysis_id=? AND summary_status=?",
		(analysis_id, SummaryStatus.pending.value),
	)["c"]
	if remaining > 0:
		print(f"🔍 APP DEBUG: Marking {remaining} remaining pending summaries as failed")
		execute(
			"UPDATE comments SET summary_status=? WHERE analysis_id=? AND summary_status=?",
			(SummaryStatus.error.value, analysis_id, SummaryStatus.pending.value),
		)
	
	# Mark analysis as done and clear progress
	meta = fetchone("SELECT meta FROM analyses WHERE id=?", (analysis_id,))
	try:
		cur_meta = json.loads(meta["meta"]) if meta and meta["meta"] else {}
	except Exception:
		cur_meta = {}
	cur_meta["summarization_progress"] = 100  # Mark as 100% complete
	# Clear any stale summarizer error if present
	if "summarizer_error" in cur_meta:
		try:
			del cur_meta["summarizer_error"]
		except Exception:
			cur_meta["summarizer_error"] = None
	execute("UPDATE analyses SET status=?, meta=? WHERE id=?", (AnalysisStatus.done.value, json.dumps(cur_meta), analysis_id))
	print(f"🔍 APP DEBUG: Summarization completed for analysis {analysis_id}")


def mark_summaries_unavailable(analysis_id: str) -> None:
	executemany(
		"UPDATE comments SET summary_status=? WHERE analysis_id=? AND summary_status=?",
		[(SummaryStatus.error.value, analysis_id, SummaryStatus.pending.value)],
	)
	# Also set summarization_progress to 100 so the UI treats this as terminal
	meta = fetchone("SELECT meta FROM analyses WHERE id= ?", (analysis_id,))
	try:
		cur_meta = json.loads(meta["meta"]) if meta and meta["meta"] else {}
	except Exception:
		cur_meta = {}
	cur_meta["summarization_progress"] = 100
	execute("UPDATE analyses SET status=?, meta=? WHERE id=?", (AnalysisStatus.done.value, json.dumps(cur_meta), analysis_id))


def row_to_analysis_out(r) -> Dict[str, Any]:
	# Derive summary_model from meta if present; otherwise, infer from first comment
	try:
		meta_obj = json.loads(r["meta"]) if r["meta"] else {}
	except Exception:
		meta_obj = {}
	summary_model_value = meta_obj.get("summary_model")
	if not summary_model_value:
		try:
			first_comment = fetchone("SELECT summary_model FROM comments WHERE analysis_id=? LIMIT 1", (r["id"],))
			summary_model_value = first_comment["summary_model"] if first_comment and first_comment.get("summary_model") else None
		except Exception:
			summary_model_value = None
	return {
		"id": r["id"],
		"name": r["name"],
		"created_at": r["created_at"],
		"status": r["status"],
		"total_comments": r["total_comments"] or 0,
		"sentiment_counts": json.loads(r["sentiment_counts"]) if r["sentiment_counts"] else None,
		"sentiment_model": r["sentiment_model"] if "sentiment_model" in r.keys() else None,
		"summary_model": summary_model_value,
		"meta": meta_obj if meta_obj else None,
	}


def row_to_comment_out(r) -> Dict[str, Any]:
	return {
		"id": r["id"],
		"analysis_id": r["analysis_id"],
		"original_text": r["original_text"],
		"cleaned_text": r["cleaned_text"],
		"sentiment_label": r["sentiment_label"],
		"sentiment_score": r["sentiment_score"],
		"summary": r["summary"],
		"summary_status": r["summary_status"],
		"summary_model": r["summary_model"] if "summary_model" in r.keys() else None,
		"created_at": r["created_at"],
		"external_file": r["external_file"],
	}

@app.get("/analyses/{analysis_id}/wordcloud")
def get_wordcloud(analysis_id: str):
	"""Generate wordcloud on-demand and return as base64 image"""
	try:
		# Test wordcloud generation first
		from wordcloud import WordCloud
		test_wc = WordCloud(width=400, height=300, background_color="white").generate("test text")
		
		comments = fetchall(
			"SELECT original_text, summary FROM comments WHERE analysis_id=?",
			(analysis_id,),
		)
		
		if not comments:
			raise HTTPException(status_code=404, detail="No comments found for this analysis")
		
		# Extract all text from comments
		all_text = []
		for comment in comments:
			if comment['original_text']:
				all_text.append(comment['original_text'])
			if comment['summary']:
				all_text.append(comment['summary'])
		
		if not all_text:
			raise HTTPException(status_code=404, detail="No text data available for wordcloud")
		
		# Generate wordcloud directly
		combined_text = '\n'.join(all_text)
		wc = WordCloud(width=1200, height=800, background_color="white").generate(combined_text)
		
		# Convert to base64
		img_buffer = io.BytesIO()
		wc.to_image().save(img_buffer, format='PNG')
		img_buffer.seek(0)
		img_base64 = base64.b64encode(img_buffer.getvalue()).decode()
		
		return {"image": f"data:image/png;base64,{img_base64}"}
	except HTTPException:
		raise
	except Exception as e:
		raise HTTPException(status_code=500, detail=f"Error generating wordcloud: {str(e)}")
