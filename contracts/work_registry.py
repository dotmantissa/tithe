# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
import re


def now() -> int:
    return int(datetime.now(timezone.utc).timestamp())


def require(ok: bool, message: str) -> None:
    if not ok:
        raise gl.vm.UserError("[EXPECTED] " + message)


def public_url(url: str) -> None:
    require(url.startswith("https://") and len(url) <= 2048, "A public HTTPS URL is required")
    host = url[8:].split("/")[0].split(":")[0].lower()
    require(bool(host) and "." in host and "@" not in url and not host.startswith(("127.", "10.", "192.168.", "169.254.", "172.", "0.")) and host not in ("localhost", "metadata.google.internal") and "[" not in host, "Private network URLs are not allowed")


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
        require(not raw.startswith(b"RIFF") or raw[8:12] == b"WEBP", "Only PNG, JPEG and WebP still images are supported")
        return {"kind": "image", "body": raw, "text": ""}
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise gl.vm.UserError("[EXPECTED] Only UTF8 text and PNG, JPEG, WebP images are supported")
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
    decision = answer.get("decision")
    clause = answer.get("clause")
    reason = answer.get("reason")
    if decision not in allowed or not isinstance(clause, str) or clause not in ["C" + str(i + 1) for i in range(clause_count)] or not isinstance(reason, str) or not 10 <= len(reason) <= 2000:
        raise gl.vm.UserError("[LLM_ERROR] Invalid decision, clause or explanation")
    return {"decision": decision, "clause": clause, "reason": reason}


def numbered_terms(text: str) -> list[str]:
    return ["C" + str(i + 1) + ": " + line for i, line in enumerate(text.splitlines()) if line.strip()]


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
    works: TreeMap[str, Work]
    work_ids: DynArray[str]
    creator_works: TreeMap[Address, DynArray[str]]
    versions: TreeMap[str, str]

    def __init__(self):
        pass

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
            prices[key] = value
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
        return work_id

    @gl.public.write
    def update_terms(self, work_id: str, terms_text: str, price_schedule_atto: str, licence_class: str) -> int:
        require(work_id in self.works, "Work not found")
        work = self.works[work_id]
        require(work.creator == gl.message.sender_address, "Only the creator may change terms")
        require(work.version < 128, "Terms version limit reached")
        terms = self._terms(terms_text, price_schedule_atto, licence_class)
        work.version = u256(work.version + 1)
        self.versions[work_id + ":" + str(work.version)] = json.dumps(terms, sort_keys=True)
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
    def get_terms_at(self, work_id: str, used_at: int) -> dict:
        require(work_id in self.works and used_at <= now(), "Invalid work or use time")
        work = self.works[work_id]
        for version in range(int(work.version), 0, -1):
            terms = self.get_terms(work_id, version)
            if terms["effective_at"] <= used_at:
                return {"version": version, "terms": terms}
        raise gl.vm.UserError("[EXPECTED] Use predates registration")

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
