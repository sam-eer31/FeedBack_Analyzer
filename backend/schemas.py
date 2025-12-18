from __future__ import annotations
from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from .models import AnalysisStatus, SummaryStatus


class AnalysisOut(BaseModel):
	id: str
	name: Optional[str]
	created_at: str
	status: AnalysisStatus
	total_comments: int
	sentiment_counts: Optional[Dict[str, int]] = None
	meta: Optional[Dict[str, Any]] = None


class CommentOut(BaseModel):
	id: str
	analysis_id: str
	original_text: str
	cleaned_text: Optional[str] = None
	sentiment_label: Optional[str] = None
	sentiment_score: Optional[float] = None
	summary: Optional[str] = None
	summary_status: SummaryStatus
	summary_model: Optional[str] = None
	created_at: str
	external_file: Optional[str] = None


