import os
import json
import time
import requests
from typing import Dict, List, Tuple
from concurrent.futures import ThreadPoolExecutor, as_completed

from dotenv import load_dotenv
load_dotenv()

import google.genai as genai

MAX_BATCH_CHARS = int(os.getenv("MAX_BATCH_CHARS", "18000"))
# Hard cap for comments per batch (can be overridden), default now 200
MAX_COMMENTS_PER_BATCH = int(os.getenv("MAX_COMMENTS_PER_BATCH", "200"))
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
SUM_MAX_WORDS = int(os.getenv("SUM_MAX_WORDS", "20"))
SUM_CONCURRENCY = int(os.getenv("SUM_CONCURRENCY", "3"))


def chunk_batches(items: List[Tuple[str, str]]) -> List[List[Tuple[str, str]]]:
	"""Create batches that start small and grow, respecting char and size limits.

	Example for 100 items: 10, 20, 30, 40 (subject to caps). Remaining items are appended.
	"""
	if not items:
		return []

	# Build desired sizes: start small (10), grow by ~1.5x, cap at MAX_COMMENTS_PER_BATCH
	desired_sizes: List[int] = []
	remaining = len(items)
	next_size = min(10, MAX_COMMENTS_PER_BATCH)
	while sum(desired_sizes) < len(items):
		desired_sizes.append(next_size)
		next_size = min(int(next_size * 1.5), MAX_COMMENTS_PER_BATCH)
		if sum(desired_sizes) + next_size > len(items):
			desired_sizes.append(len(items) - sum(desired_sizes))
			break

	batches: List[List[Tuple[str, str]]] = []
	idx = 0
	for target in desired_sizes:
		cur: List[Tuple[str, str]] = []
		chars = 0
		limit = min(target, MAX_COMMENTS_PER_BATCH)
		while idx < len(items) and len(cur) < limit:
			cid, text = items[idx]
			add_len = len(text) + 64
			if cur and (len(cur) >= MAX_COMMENTS_PER_BATCH or chars + add_len > MAX_BATCH_CHARS):
				break
			cur.append((cid, text))
			chars += add_len
			idx += 1
		if cur:
			batches.append(cur)

	# If any items remain due to char limits, append them in capped chunks
	while idx < len(items):
		cur: List[Tuple[str, str]] = []
		chars = 0
		while idx < len(items) and len(cur) < MAX_COMMENTS_PER_BATCH:
			cid, text = items[idx]
			add_len = len(text) + 64
			if cur and (len(cur) >= MAX_COMMENTS_PER_BATCH or chars + add_len > MAX_BATCH_CHARS):
				break
			cur.append((cid, text))
			chars += add_len
			idx += 1
		if cur:
			batches.append(cur)

	return batches


def build_prompt(batch: list[tuple[str, str]]) -> str:

    def _escape(s: str) -> str:
        # Escape backslashes and double-quotes and replace newlines with literal \n
        # We intentionally keep the escaped form readable to the model, e.g.
        # "This is line1\nThis is line2" so it will not produce unexpected
        # multi-line output inside JSON.
        return s.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')

    system_rules = (
        "Summarize each provided text into ONE plain sentence.",
        "Keep each summary shorter than its original text and use only essential information.",
        "Do NOT add subjects or qualifiers like 'User', 'They', 'The comment', or similar.",
        "Do NOT add any preface or extra words; write only the summary content.",
        "Prefer fewer words when possible; keep it concise.",
        "Paraphrase the input — do NOT repeat or quote the original text.",
        "Return ONLY a single JSON array (no markdown, no code fences, no extra text).",
        'JSON format: [{"id":"<exact-uuid>","summary":"<one-sentence-summary>"}]',
        'CRITICAL JSON RULES: use double quotes for all strings; no trailing commas; no line breaks inside the JSON; escape quotes in summaries with \\\"; return ONLY the JSON array.'
    )

    parts = [f"System: {rule}" for rule in system_rules]
    parts.append("User:")
    parts.append("BEGIN_BATCH")

    for cid, text in batch:
        safe_text = _escape(text)
        # keep the same item markers to preserve your downstream logic
        parts.append(f"--ITEM--ID:{cid}--TEXT--\\n{safe_text}\\n--END--")

    parts.append("END_BATCH")
    parts.append(f"System: You must return exactly {len(batch)} summaries, one for each item above.")
    parts.append(f"System: Expected IDs: {[cid for cid, _ in batch]}")
    parts.append("System: Return ONLY the JSON array, no other text:")

    # join with single newlines so the whole prompt is a single multi-line string
    return "\n".join(parts)


def parse_json_array(text: str):
	print(f"🔍 JSON DEBUG: Parsing text: {text[:200]}...")
	# Clean input
	text = (text or "").strip()
	try:
		result = json.loads(text)
		print(f"✅ JSON DEBUG: Direct parse successful: {result}")
		return result
	except Exception as e:
		print(f"❌ JSON DEBUG: Direct parse failed: {e}")
	# Markdown code block
	if "```json" in text:
		print(f"🔍 JSON DEBUG: Found markdown code block")
		start = text.find("```json") + 7
		end = text.find("```", start)
		if end != -1:
			extracted = text[start:end].strip()
			print(f"🔍 JSON DEBUG: Extracted from markdown: {extracted[:200]}...")
			try:
				result = json.loads(extracted)
				print(f"✅ JSON DEBUG: Markdown extraction successful: {result}")
				return result
			except Exception as e2:
				print(f"❌ JSON DEBUG: Markdown extraction failed: {e2}")
	# Array extraction and fixups
	start = text.find("[")
	end = text.rfind("]")
	if start != -1 and end != -1 and start < end:
		json_text = text[start:end+1]
		print(f"🔍 JSON DEBUG: Extracted JSON: {json_text[:200]}...")
		try:
			result = json.loads(json_text)
			print(f"✅ JSON DEBUG: Array extraction successful: {result}")
			return result
		except Exception as e2:
			print(f"❌ JSON DEBUG: Array extraction failed: {e2}")
			# Try common fixes
			fixed = _fix_json_syntax(json_text)
			if fixed != json_text:
				print("🔍 JSON DEBUG: Attempting to fix JSON syntax")
				try:
					result = json.loads(fixed)
					print(f"✅ JSON DEBUG: Fixed JSON parse successful: {result}")
					return result
				except Exception as e3:
					print(f"❌ JSON DEBUG: Fixed JSON parse failed: {e3}")
	# Individual objects fallback
	import re as _re
	json_objects = _re.findall(r'\{[^{}]*\}', text)
	if json_objects:
		print(f"🔍 JSON DEBUG: Found {len(json_objects)} individual JSON objects")
		try:
			parsed_objects = [json.loads(obj_text) for obj_text in json_objects]
			print(f"✅ JSON DEBUG: Individual objects parse successful: {parsed_objects}")
			return parsed_objects
		except Exception as e3:
			print(f"❌ JSON DEBUG: Individual objects parse failed: {e3}")
	print(f"❌ JSON DEBUG: All parsing attempts failed")
	raise ValueError(f"Could not parse JSON from text: {text[:100]}...")


def _fix_json_syntax(json_text: str) -> str:
	import re
	# Remove trailing commas
	json_text = re.sub(r',\s*([}\]])', r'\1', json_text)
	# Remove non-printable chars
	json_text = ''.join(c for c in json_text if ord(c) >= 32 or c in '\n\r\t')
	# Ensure brackets
	if not json_text.strip().startswith('['):
		json_text = '[' + json_text
	if not json_text.strip().endswith(']'):
		json_text = json_text + ']'
	return json_text


def normalize_summary(summary: str) -> str:
	s = summary.strip().strip('"').strip("'")
	for sep in ['. ', '! ', '? ']:
		idx = s.find(sep)
		if idx != -1:
			s = s[:idx]
			break
	words = s.split()
	if len(words) > SUM_MAX_WORDS:
		s = " ".join(words[:SUM_MAX_WORDS])
	if not s.endswith('.'):
		s += '.'
	return s


class GeminiSummarizer:
	def __init__(self) -> None:
		api_key = os.getenv("GEMINI_API_KEY")
		if not api_key:
			raise RuntimeError("GEMINI_API_KEY not set")
		genai.configure(api_key=api_key)
		self.model = genai.GenerativeModel(self._resolve_model_name(GEMINI_MODEL))

	def _resolve_model_name(self, configured: str) -> str:
		"""Enforce exact Gemini Flash model only. No auto-fallbacks."""
		try:
			available = list(genai.list_models())
			available_names = [getattr(m, "name", str(m)) for m in available]
			for m in available:
				name = getattr(m, "name", "")
				methods = getattr(m, "supported_generation_methods", None) or []
				if name == configured and ("generateContent" in methods or "generate_content" in methods):
					print(f"🔍 GEMINI DEBUG: Using configured model '{configured}'")
					return configured
			raised_list = ", ".join(available_names) or "<none>"
			raise RuntimeError(f"Configured Gemini model '{configured}' not available for generateContent. Available={raised_list}")
		except Exception:
			# If listing fails, use configured and let API enforce correctness
			return configured

	def summarize_in_batches(self, items: List[Tuple[str, str]]) -> Dict[str, Dict[str, str]]:
		results: Dict[str, Dict[str, str]] = {cid: {"ok": False} for cid, _ in items}
		batches = chunk_batches(items)
		if not batches:
			return results
		with ThreadPoolExecutor(max_workers=max(1, SUM_CONCURRENCY)) as ex:
			futures = {ex.submit(self._process_one_batch, batch): batch for batch in batches}
			for fut in as_completed(futures):
				batch_result = fut.result()
				for cid, payload in batch_result.items():
					results[cid] = payload
		# mark any still false
		for cid in list(results.keys()):
			if not results[cid].get("ok"):
				results[cid] = {"ok": False}
		return results

	def summarize_in_batches_stream(self, items: List[Tuple[str, str]]):
		"""Yield results per completed batch for progressive updates."""
		batches = chunk_batches(items)
		if not batches:
			return
		with ThreadPoolExecutor(max_workers=max(1, SUM_CONCURRENCY)) as ex:
			futures = {ex.submit(self._process_one_batch, batch): batch for batch in batches}
			for fut in as_completed(futures):
				batch_result = fut.result()
				yield batch_result

	def _process_one_batch(self, batch: List[Tuple[str, str]]) -> Dict[str, Dict[str, str]]:
		print(f"🔍 GEMINI DEBUG: Processing batch with {len(batch)} items")
		out: Dict[str, Dict[str, str]] = {cid: {"ok": False} for cid, _ in batch}
		remaining_items = list(batch)
		max_attempts = 3
		for attempt in range(max_attempts):
			if not remaining_items:
				break
			print(f"🔍 GEMINI DEBUG: Attempt {attempt + 1} with {len(remaining_items)} remaining items")
			try:
				prompt = build_prompt(remaining_items)
				resp = self.model.generate_content(prompt)
				text = (getattr(resp, "text", "") or "").strip()
				print(f"🔍 GEMINI DEBUG: Response length: {len(text)}")
				parsed = parse_json_array(text)
				# Process results and identify successful vs failed items (positional mapping for consistency)
				successful_items: List[Tuple[str, str]] = []
				failed_items: List[Tuple[str, str]] = []
				print(f"🔍 GEMINI DEBUG: Matching {len(parsed)} results to {len(remaining_items)} remaining items")
				for i, obj in enumerate(parsed):
					if i < len(remaining_items):
						cid, text_in = remaining_items[i]
						if isinstance(obj, dict):
							summary = str(obj.get("summary", "")).strip()
						elif isinstance(obj, str):
							summary = obj.strip()
						else:
							summary = str(obj).strip()
						if len(summary) >= 5 and summary.lower() != summary.upper():
							normalized = normalize_summary(summary)
							out[cid] = {"ok": True, "summary": normalized}
							successful_items.append((cid, text_in))
							print(f"✅ GEMINI SUCCESS: {cid} -> '{normalized}'")
						else:
							failed_items.append((cid, text_in))
							out[cid] = {"ok": False, "error": "Empty or invalid summary"}
							print(f"❌ GEMINI REJECTED: {cid} - summary too short or invalid: '{summary}'")
					else:
						print(f"⚠️ GEMINI WARNING: Extra summary at position {i}, ignoring")
				# Mark any remaining items (not processed) as failed
				for i in range(len(parsed), len(remaining_items)):
					cid, text_in = remaining_items[i]
					failed_items.append((cid, text_in))
					out[cid] = {"ok": False, "error": "No summary generated"}
					print(f"❌ GEMINI FAILED: {cid} - no summary generated (position {i} not processed)")
				attempt_success_rate = len(successful_items) / len(remaining_items) if remaining_items else 0
				print(f"🔍 GEMINI DEBUG: Attempt {attempt + 1} success rate: {len(successful_items)}/{len(remaining_items)} ({attempt_success_rate:.1%})")
				if attempt_success_rate >= 0.9:
					print(f"✅ GEMINI BATCH COMPLETE: Success rate {attempt_success_rate:.1%} >= 90%, batch complete")
					break
				if failed_items:
					print(f"🔄 GEMINI AUTO-RETRY: Success rate {attempt_success_rate:.1%} < 90%, retrying {len(failed_items)} failed items")
					remaining_items = failed_items
				else:
					break
			except Exception as e:
				print(f"❌ GEMINI ERROR in attempt {attempt + 1}: {e}")
				if attempt == max_attempts - 1:
					for cid, _ in remaining_items:
						out[cid] = {"ok": False, "error": f"{str(e)}"}
					break
				time.sleep(2 ** attempt)
		# Mark any remaining not-ok as failed
		for cid, _ in remaining_items:
			if cid not in out or not out[cid].get("ok"):
				out[cid] = {"ok": False, "error": out.get(cid, {}).get("error", "Failed after all retry attempts")}
		print(f"🔍 GEMINI DEBUG: Final batch result: {out}")
		return out






class OllamaSummarizer:
	def __init__(self, model_name: str = "gemma3:1b") -> None:
		self.model_name = model_name
		self.ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")
		self._test_connection()

	def _test_connection(self) -> None:
		"""Test if Ollama is running and model is available."""
		try:
			print(f"🔍 OLLAMA DEBUG: Testing connection to {self.ollama_url}")
			response = requests.get(f"{self.ollama_url}/api/tags", timeout=500)
			print(f"🔍 OLLAMA DEBUG: Connection test response: {response.status_code}")
			if response.status_code != 200:
				raise RuntimeError(f"Ollama not responding: {response.status_code}")
			
			models = response.json().get("models", [])
			model_names = [model.get("name", "") for model in models]
			print(f"🔍 OLLAMA DEBUG: Available models: {model_names}")
			if self.model_name not in model_names:
				raise RuntimeError(f"Model {self.model_name} not found. Available models: {model_names}")
			print(f"✅ OLLAMA DEBUG: Model {self.model_name} found and ready")
		except requests.exceptions.RequestException as e:
			print(f"❌ OLLAMA ERROR: Connection failed: {e}")
			raise RuntimeError(f"Cannot connect to Ollama at {self.ollama_url}: {e}")

	def summarize_in_batches(self, items: List[Tuple[str, str]]) -> Dict[str, Dict[str, str]]:
		results: Dict[str, Dict[str, str]] = {cid: {"ok": False} for cid, _ in items}
		batches = chunk_batches(items)
		if not batches:
			return results
		with ThreadPoolExecutor(max_workers=max(1, SUM_CONCURRENCY)) as ex:
			futures = {ex.submit(self._process_one_batch, batch): batch for batch in batches}
			for fut in as_completed(futures):
				batch_result = fut.result()
				for cid, payload in batch_result.items():
					results[cid] = payload
		# mark any still false
		for cid in list(results.keys()):
			if not results[cid].get("ok"):
				results[cid] = {"ok": False}
		return results

	def summarize_in_batches_stream(self, items: List[Tuple[str, str]]):
		"""Yield results per completed batch for progressive updates."""
		batches = chunk_batches(items)
		if not batches:
			return
		with ThreadPoolExecutor(max_workers=max(1, SUM_CONCURRENCY)) as ex:
			futures = {ex.submit(self._process_one_batch, batch): batch for batch in batches}
			for fut in as_completed(futures):
				batch_result = fut.result()
				yield batch_result

	def _process_one_batch(self, batch: List[Tuple[str, str]]) -> Dict[str, Dict[str, str]]:
		print(f"🔍 OLLAMA DEBUG: Processing batch with {len(batch)} items")
		out: Dict[str, Dict[str, str]] = {cid: {"ok": False} for cid, _ in batch}
		
		# Process the batch with immediate retry logic
		remaining_items = list(batch)  # Items that still need processing
		max_attempts = 3
		
		for attempt in range(max_attempts):
			if not remaining_items:
				break
				
			print(f"🔍 OLLAMA DEBUG: Attempt {attempt + 1} with {len(remaining_items)} remaining items")
			
			try:
				prompt = build_prompt(remaining_items)
				print(f"🔍 OLLAMA DEBUG: Sending prompt to {self.model_name}")
				print(f"🔍 OLLAMA DEBUG: Prompt preview: {prompt[:300]}...")
				
				response = requests.post(
					f"{self.ollama_url}/api/generate",
					json={
						"model": self.model_name,
						"prompt": prompt,
						"stream": False,
						"options": {
							"temperature": 0.3,
							"top_p": 0.9,
							"max_tokens": 2000
						}
					},
					timeout=60
				)
				print(f"🔍 OLLAMA DEBUG: Response status: {response.status_code}")
				
				if response.status_code != 200:
					print(f"❌ OLLAMA ERROR: {response.status_code} - {response.text}")
					raise ValueError(f"Ollama API error: {response.status_code} - {response.text}")
				
				result = response.json()
				text = result.get("response", "").strip()
				print(f"🔍 OLLAMA DEBUG: Raw response from Gemma3:")
				print(f"📝 {text}")
				print(f"🔍 OLLAMA DEBUG: Response length: {len(text)}")
				
				parsed = parse_json_array(text)
				print(f"🔍 OLLAMA DEBUG: Parsed JSON: {parsed}")
				
				# Process results and identify successful vs failed items
				successful_items = []
				failed_items = []
				
				# CRITICAL: Match parsed results to remaining items by position to prevent mismatch
				print(f"🔍 OLLAMA DEBUG: Matching {len(parsed)} results to {len(remaining_items)} remaining items")
				for i, obj in enumerate(parsed):
					if i < len(remaining_items):
						cid, text = remaining_items[i]
						
						# Handle both dict and string objects
						if isinstance(obj, dict):
							summary = str(obj.get("summary", "")).strip()
						elif isinstance(obj, str):
							summary = obj.strip()
						else:
							summary = str(obj).strip()
							
						print(f"🔍 OLLAMA DEBUG: Position {i}: Comment {cid} -> Summary: '{summary}'")
						
						if len(summary) >= 5 and summary.lower() != summary.upper():
							# Success - normalize and store with EXACT comment ID
							normalized = normalize_summary(summary)
							out[cid] = {"ok": True, "summary": normalized}
							successful_items.append((cid, text))
							print(f"✅ OLLAMA SUCCESS: {cid} -> '{normalized}'")
						else:
							# Failed - will retry with EXACT comment ID
							failed_items.append((cid, text))
							print(f"❌ OLLAMA REJECTED: {cid} - summary too short or invalid: '{summary}'")
					else:
						print(f"⚠️ OLLAMA WARNING: Extra summary at position {i}, ignoring")
				
				# Mark any remaining items (not processed) as failed with EXACT comment IDs
				for i in range(len(parsed), len(remaining_items)):
					cid, text = remaining_items[i]
					failed_items.append((cid, text))
					print(f"❌ OLLAMA FAILED: {cid} - no summary generated (position {i} not processed)")
				
				# Calculate success rate for this attempt
				attempt_success_rate = len(successful_items) / len(remaining_items) if remaining_items else 0
				print(f"🔍 OLLAMA DEBUG: Attempt {attempt + 1} success rate: {len(successful_items)}/{len(remaining_items)} ({attempt_success_rate:.1%})")
				
				# If success rate is >= 90%, we're done with this batch
				if attempt_success_rate >= 0.9:
					print(f"✅ OLLAMA BATCH COMPLETE: Success rate {attempt_success_rate:.1%} >= 90%, batch complete")
					break
				
				# If success rate < 90%, retry only the failed items
				if failed_items:
					print(f"🔄 OLLAMA AUTO-RETRY: Success rate {attempt_success_rate:.1%} < 90%, retrying {len(failed_items)} failed items")
					remaining_items = failed_items
				else:
					# No failed items, we're done
					break
					
			except Exception as e:
				print(f"❌ OLLAMA ERROR in attempt {attempt + 1}: {e}")
				if attempt == max_attempts - 1:
					# Final attempt failed, mark all remaining as error
					for cid, _ in remaining_items:
						out[cid] = {"ok": False, "error": f"Failed after {max_attempts} attempts: {str(e)}"}
					break
				time.sleep(2 ** attempt)
		
		# Mark any remaining items as failed
		for cid, _ in remaining_items:
			if cid not in out or not out[cid].get("ok"):
				out[cid] = {"ok": False, "error": "Failed after all retry attempts"}
		
		# Final success rate check and validation
		success_count = sum(1 for result in out.values() if result.get("ok"))
		total_count = len(out)
		final_success_rate = success_count / total_count if total_count > 0 else 0
		
		print(f"🔍 OLLAMA DEBUG: Final batch success rate: {success_count}/{total_count} ({final_success_rate:.1%})")
		
		# CRITICAL: Validate that all summaries are properly matched to their comment IDs
		print(f"🔍 OLLAMA DEBUG: Final batch validation:")
		for cid, result in out.items():
			if result.get("ok"):
				summary = result.get("summary", "")
				print(f"  ✅ {cid} -> '{summary}'")
			else:
				error = result.get("error", "Unknown error")
				print(f"  ❌ {cid} -> ERROR: {error}")
		
		print(f"🔍 OLLAMA DEBUG: Final batch result: {out}")
		return out


