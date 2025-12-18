import io
import json
import re
from typing import List, Dict, Any

from fastapi import UploadFile, HTTPException


def clean_text(text: str) -> str:
	t = text.strip()
	t = re.sub(r"\s+", " ", t)
	return t


async def parse_files_to_comments(files: List[UploadFile]) -> List[Dict[str, Any]]:
	items: List[Dict[str, Any]] = []
	for f in files:
		content = await f.read()
		name = f.filename or "uploaded"
		text = content.decode("utf-8", errors="ignore")
		if name.lower().endswith(".csv"):
			items.extend(parse_csv(text, name))
		elif name.lower().endswith(".json"):
			items.extend(parse_json(text, name))
		else:
			items.extend(parse_txt(text, name))
	if not items:
		raise HTTPException(status_code=400, detail="No comments parsed from files")
	# normalize
	out: List[Dict[str, Any]] = []
	seen = set()
	for it in items:
		text = clean_text(str(it.get("text", "")))
		if not text:
			continue
		key = text
		dup = key in seen
		seen.add(key)
		out.append({"text": text, "file": it.get("file"), "duplicate": dup})
	return out


def parse_csv(text: str, filename: str) -> List[Dict[str, Any]]:
	rows = []
	import csv
	reader = csv.DictReader(io.StringIO(text))
	if "text" not in (reader.fieldnames or []):
		raise HTTPException(status_code=400, detail=f"CSV missing 'text' column in {filename}")
	for row in reader:
		rows.append({"id": row.get("comment_id") or row.get("id"), "text": row.get("text", ""), "file": filename})
	return rows


def parse_json(text: str, filename: str) -> List[Dict[str, Any]]:
	try:
		arr = json.loads(text)
	except Exception:
		raise HTTPException(status_code=400, detail=f"Invalid JSON in {filename}")
	if not isinstance(arr, list):
		raise HTTPException(status_code=400, detail=f"JSON must be an array in {filename}")
	out = []
	for obj in arr:
		if not isinstance(obj, dict) or "text" not in obj:
			continue
		out.append({"id": obj.get("id"), "text": obj.get("text", ""), "file": filename})
	return out


def parse_txt(text: str, filename: str) -> List[Dict[str, Any]]:
	lines = [ln.strip() for ln in text.splitlines()]
	return [{"text": ln, "file": filename} for ln in lines if ln]


def compute_sentiment_counts(labels: List[str]) -> Dict[str, int]:
	counts = {"positive": 0, "neutral": 0, "negative": 0}
	for l in labels:
		if l in counts:
			counts[l] += 1
	return counts


def safe_json_dumps(data: Any) -> str:
	return json.dumps(data, ensure_ascii=False)
