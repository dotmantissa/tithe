# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import re
from urllib.parse import urlsplit
from PIL import Image


def now() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def require(ok: bool, message: str) -> None:
    if not ok:
        raise gl.vm.UserError("[EXPECTED] " + message)


def public_url(url: str) -> None:
    require(url.startswith("https://") and len(url) <= 2048 and not any(c.isspace() for c in url) and "\\" not in url, "A public HTTPS URL is required")
    try:
        parsed = urlsplit(url)
        host = parsed.hostname or ""
        valid = parsed.scheme == "https" and parsed.port in (None, 443) and not parsed.username and not parsed.password and not parsed.fragment
    except ValueError:
        valid, host = False, ""
    require(valid and bool(re.fullmatch(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}", host)) and not host.endswith((".local", ".localhost", ".internal", ".home", ".lan", ".invalid", ".test")), "Private or malformed network URLs are not allowed")


def is_animated(raw: bytes) -> bool:
    png = raw.startswith(b"\x89PNG\r\n\x1a\n")
    offset = 8 if png else 12
    while offset + 8 <= len(raw):
        size = int.from_bytes(raw[offset:offset + 4], "big") if png else int.from_bytes(raw[offset + 4:offset + 8], "little")
        kind = raw[offset + 4:offset + 8] if png else raw[offset:offset + 4]
        if kind == (b"acTL" if png else b"ANIM"):
            return True
        offset += size + 12 if png else size + 8 + (size % 2)
    return False


class ImageBytes:
    def __init__(self, raw: bytes):
        self.raw = raw
        self.offset = 0

    def read(self, size: int = -1) -> bytes:
        end = len(self.raw) if size < 0 else min(len(self.raw), self.offset + size)
        value = self.raw[self.offset:end]
        self.offset = end
        return value

    def seek(self, offset: int, whence: int = 0) -> int:
        self.offset = offset + (self.offset if whence == 1 else len(self.raw) if whence == 2 else 0)
        return self.offset

    def tell(self) -> int:
        return self.offset

    def close(self) -> None:
        pass


def fetch_artifact(url: str, content_hash: str) -> dict:
    public_url(url)
    response = gl.nondet.web.get(url)
    if response.status != 200:
        raise gl.vm.UserError("[EXTERNAL] Artifact unavailable")
    raw = response.body
    require(0 < len(raw) <= 2_000_000, "Artifact must be between 1 byte and 2 MB")
    require(hashlib.sha256(raw).hexdigest() == content_hash, "Content hash changed")
    is_image = raw.startswith((b"\x89PNG\r\n\x1a\n", b"\xff\xd8\xff", b"RIFF"))
    if is_image:
        require(not raw.startswith(b"RIFF") or raw[8:12] == b"WEBP", "Only PNG and WebP still images are supported")
        require(not (raw.startswith(b"\x89PNG") or raw.startswith(b"RIFF")) or not is_animated(raw), "Animated images are not supported")
        try:
            image = Image.open(ImageBytes(raw))
            require(image.format in ("PNG", "WEBP"), "Only PNG and WebP are supported")
            require(getattr(image, "n_frames", 1) == 1, "Animated images are not supported")
            require(0 < image.width <= 4096 and 0 < image.height <= 4096 and image.width * image.height <= 16_000_000, "Image dimensions exceed the limit")
            image.verify()
            decoded = Image.open(ImageBytes(raw))
            decoded.load()
        except gl.vm.UserError:
            raise
        except Exception:
            raise gl.vm.UserError("[EXPECTED] Invalid or unsupported still image")
        return {"kind": "image", "body": raw, "text": ""}
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise gl.vm.UserError("[EXPECTED] Only UTF8 text and PNG and WebP images are supported")
    require("\x00" not in text and len(text) <= 24000, "Text must be at most 24000 characters")
    return {"kind": "text", "body": raw, "text": text}


def parse_answer(answer: object, allowed: tuple[str, ...], clause_count: int) -> dict:
    if isinstance(answer, str):
        try:
            answer = json.loads(answer.strip().removeprefix("```json").removesuffix("```").strip())
        except (ValueError, TypeError):
            raise gl.vm.UserError("[LLM_ERROR] Invalid JSON")
    if not isinstance(answer, dict):
        raise gl.vm.UserError("[LLM_ERROR] Expected a decision object")
    decision, clause = answer.get("decision"), answer.get("clause")
    if decision not in allowed or not isinstance(clause, str) or clause not in ["C" + str(i + 1) for i in range(clause_count)]:
        raise gl.vm.UserError("[LLM_ERROR] Invalid decision or clause")
    return {"decision": decision, "clause": clause}


def canonical_decision(answer: object, allowed: tuple[str, ...], clause_count: int) -> dict:
    if not isinstance(answer, dict) or set(answer) != {"decision", "clause"}:
        raise gl.vm.UserError("[LLM_ERROR] Unexpected consensus fields")
    return parse_answer(answer, allowed, clause_count)


def explanation(decision: str, clause: str, clauses: list[str]) -> str:
    labels = {"APPROVE": "approved the described use", "REFUSE": "refused the described use", "USE": "found use outside the terms", "NO_USE": "found no established use", "DERIVATIVE_WITHIN_TERMS": "found use within the terms"}
    condition = clauses[int(clause[1:]) - 1][len(clause) + 2:]
    return "The panel " + labels[decision] + " under " + clause + ". The recorded condition is: " + condition[:1200]


@gl.evm.contract_interface
class Recipient:
    class View:
        pass
    class Write:
        pass

@allow_storage
@dataclass
class Work:
    creator: Address
    url: str
    content_hash: str
    kind: str
    title: str
    version: u256
    registered_at: u256


class WorkRegistry(gl.Contract):
    revision: u256
    works: TreeMap[str, Work]
    work_ids: DynArray[str]
    creator_works: TreeMap[Address, DynArray[str]]
    versions: TreeMap[str, str]

    def __init__(self):
        self.revision = u256(0)

    def _terms(self, terms_text: str, price_schedule_atto: str, licence_class: str) -> dict:
        lines = [line.strip() for line in terms_text.splitlines() if line.strip()]
        require(1 <= len(lines) <= 64 and 10 <= len(terms_text) <= 12000, "Write between 1 and 64 clauses, up to 12000 characters")
        try:
            schedule = json.loads(price_schedule_atto)
        except (ValueError, TypeError):
            raise gl.vm.UserError("[EXPECTED] Price schedule must be JSON")
        require(isinstance(schedule, dict) and 1 <= len(schedule) <= 4, "Provide a price schedule")
        prices = {}
        for key, value in schedule.items():
            require(key in ("research", "commercial", "quote", "derivative") and isinstance(value, str) and value.isdigit() and 0 <= int(value) < 2**128, "Prices must be atto amounts as decimal strings")
            prices[key] = str(int(value))
        require(licence_class in prices, "Default licence class must have a price")
        return {"terms_text": "\n".join(lines), "clauses": ["C" + str(i+1) + ": " + line for i,line in enumerate(lines)], "price_schedule_atto": prices, "licence_class": licence_class, "effective_at": now()}

    @gl.public.write
    def register_work(self, url: str, content_hash: str, terms_text: str, price_schedule_atto: str, licence_class: str, title: str = "Untitled work") -> str:
        public_url(url)
        require(bool(re.fullmatch("[0-9a-f]{64}", content_hash)), "Use a lowercase SHA256 content hash")
        require(1 <= len(title.strip()) <= 160, "Title must be between 1 and 160 characters")
        terms = self._terms(terms_text, price_schedule_atto, licence_class)
        def verify():
            artifact = fetch_artifact(url, content_hash)
            return artifact["kind"]
        kind = gl.eq_principle.strict_eq(verify)
        creator = gl.message.sender_address
        work_id = hashlib.sha256((creator.as_hex + ":" + content_hash + ":" + url).encode()).hexdigest()
        require(work_id not in self.works, "This work is already registered by you")
        self.works[work_id] = Work(creator, url, content_hash, kind, title.strip(), u256(1), u256(now()))
        self.work_ids.append(work_id)
        self.creator_works.get_or_insert_default(creator).append(work_id)
        self.versions[work_id + ":1"] = json.dumps(terms, sort_keys=True)
        self.revision = u256(self.revision + 1)
        return work_id

    @gl.public.write
    def update_terms(self, work_id: str, terms_text: str, price_schedule_atto: str, licence_class: str) -> int:
        require(work_id in self.works, "Work not found")
        work = self.works[work_id]
        require(work.creator == gl.message.sender_address, "Only the creator may change terms")
        require(work.version < 128, "Terms version limit reached")
        terms = self._terms(terms_text, price_schedule_atto, licence_class)
        require(terms["effective_at"] >= self.get_terms(work_id, int(work.version))["effective_at"], "Terms timestamps cannot move backwards")
        work.version = u256(work.version + 1)
        self.versions[work_id + ":" + str(work.version)] = json.dumps(terms, sort_keys=True)
        self.revision = u256(self.revision + 1)
        return int(work.version)

    @gl.public.view
    def get_work(self, work_id: str) -> dict:
        require(work_id in self.works, "Work not found")
        work = self.works[work_id]
        return {"work_id": work_id, "creator": work.creator.as_hex, "url": work.url, "content_hash": work.content_hash, "kind": work.kind, "title": work.title, "version": int(work.version), "registered_at": int(work.registered_at), "terms": self.get_terms(work_id, int(work.version))}

    @gl.public.view
    def get_terms(self, work_id: str, version: int) -> dict:
        key = work_id + ":" + str(version)
        require(key in self.versions, "Terms version not found")
        return json.loads(self.versions[key])

    @gl.public.view
    def get_terms_versions_at(self, work_id: str, used_at: int) -> list[dict]:
        require(work_id in self.works and 0 < used_at <= now(), "Invalid work or use time")
        matching = []
        effective = -1
        for version in range(int(self.works[work_id].version), 0, -1):
            terms = self.get_terms(work_id, version)
            if terms["effective_at"] <= used_at:
                if effective < 0:
                    effective = terms["effective_at"]
                if terms["effective_at"] == effective:
                    matching.append({"version": version, "terms": terms})
                else:
                    break
        require(len(matching) > 0, "Use predates registration")
        return matching

    @gl.public.view
    def get_terms_at(self, work_id: str, used_at: int, version: int = 0) -> dict:
        matches = self.get_terms_versions_at(work_id, used_at)
        if version:
            for match in matches:
                if match["version"] == version:
                    return match
            raise gl.vm.UserError("[EXPECTED] Terms version was not in force at the proposed time")
        require(len(matches) == 1, "This timestamp has multiple terms versions; agree an explicit version")
        return matches[0]

    @gl.public.view
    def list_works(self, offset: int = 0, limit: int = 20) -> list[dict]:
        require(offset >= 0 and 1 <= limit <= 50, "Invalid page")
        return [self.get_work(self.work_ids[i]) for i in range(offset, min(offset + limit, len(self.work_ids)))]

    @gl.public.view
    def get_creator_works(self, creator: str) -> list[str]:
        address = Address(creator)
        return list(self.creator_works[address]) if address in self.creator_works else []

    @gl.public.view
    def get_count(self) -> int:
        return len(self.work_ids)

    @gl.public.view
    def get_snapshot(self) -> dict:
        return {"count": len(self.work_ids), "revision": int(self.revision)}

    @gl.public.view
    def get_clock(self) -> dict:
        return {"unix_seconds": now()}
