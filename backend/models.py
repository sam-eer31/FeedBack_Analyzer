from enum import Enum


class AnalysisStatus(str, Enum):
	uploaded = "uploaded"
	processing = "processing"
	summarizing = "summarizing"
	done = "done"
	failed = "failed"


class SummaryStatus(str, Enum):
	pending = "pending"
	ok = "ok"
	error = "error"
