from typing import List, Tuple
from transformers import pipeline


class SentimentAnalyzer:
	def __init__(self, model_type: str = "roberta") -> None:
		self.model_type = model_type
		if model_type == "roberta":
			# Using cardiffnlp/twitter-roberta-base-sentiment-latest for proper 3-class sentiment analysis
			self._pipe = pipeline("sentiment-analysis", model="cardiffnlp/twitter-roberta-base-sentiment-latest")
		elif model_type == "distilbert":
			# Using distilbert-base-uncased-finetuned-sst-2-english for 2-class sentiment analysis
			self._pipe = pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english")
		else:
			raise ValueError(f"Unknown sentiment model type: {model_type}")

	def predict(self, texts: List[str]) -> Tuple[List[str], List[float]]:
		results = self._pipe(texts, truncation=True, batch_size=32)
		labels: List[str] = []
		scores: List[float] = []
		for r in results:
			raw_label = str(r.get("label", "")).lower()
			score = float(r.get("score", 0.0))
			
			if self.model_type == "roberta":
				# Map the model's labels to our expected format (3-class)
				if raw_label == "positive":
					label = "positive"
				elif raw_label == "negative":
					label = "negative"
				elif raw_label == "neutral":
					label = "neutral"
				else:
					# Fallback to neutral if unknown label
					label = "neutral"
			else:  # distilbert
				# Pure 2-class: Only positive and negative (no artificial neutral)
				if raw_label == "positive":
					label = "positive"
				elif raw_label == "negative":
					label = "negative"
				else:
					# Fallback to positive if unknown label
					label = "positive"

			labels.append(label)
			scores.append(score)
		return labels, scores
