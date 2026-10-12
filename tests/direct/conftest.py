import hashlib
import json
from types import SimpleNamespace
import pytest

SOURCE = b'The orchard remembers every hand that planted it.'
URL = 'https://example.org/orchard.txt'
HASH = hashlib.sha256(SOURCE).hexdigest()
TERMS = 'Research use is permitted with attribution.\nCommercial use requires a paid licence.'
PRICES = '{"research":"0","commercial":"100","quote":"25","derivative":"50"}'

@pytest.fixture
def evidence(direct_vm):
    direct_vm.warp('2026-01-01T12:00:00Z')
    direct_vm.mock_web(r'https://example.org/.*', {'status': 200, 'body': SOURCE})
    return SOURCE, URL, HASH

@pytest.fixture
def external_views(monkeypatch, direct_deploy, direct_vm, direct_alice, evidence):
    # Load the real SDK before replacing cross-contract views in unit tests.
    registry = direct_deploy('contracts/work_registry.py')
    direct_vm.sender = direct_alice
    work_id = registry.register_work(URL, HASH, TERMS, PRICES, 'commercial', 'The orchard', artifact_base64=encoded(SOURCE))
    work = registry.get_work(work_id)
    historic = registry.get_terms_at(work_id, 1767268800)
    from genlayer import gl
    licence_box = {}
    view = SimpleNamespace(get_work=lambda _: work, get_terms=lambda *args: work['terms'], get_terms_at=lambda *args: {"version": args[2] if len(args) > 2 and args[2] else historic["version"], "terms": work["terms"]}, get_licence=lambda key: licence_box[key], get_artifact=lambda _: work.get('artifact_base64',encoded(SOURCE)))
    monkeypatch.setattr(gl, 'get_contract_at', lambda address: SimpleNamespace(view=lambda: view))
    # Separate storage for a new target contract. Cross-contract wiring is
    # exercised with live network calls in tests/integration.
    import genlayer.gl.genvm_contracts as contract_module
    contract_module.__known_contract__ = None
    from gltest.direct.vm import InmemManager
    direct_vm._storage = InmemManager()
    return work, licence_box


def fund(contract,vm,amount):
    vm.value=amount
    contract.fund_credit()
    vm.value=0

USAGE=json.dumps({"actual_use":"Entire work copied into a paid product.","distribution":"Distributed to paying customers.","commercial_activity":"Paid product offered for 10 GEN.","competing_product":"No competing service.","attribution":"Creator credited in the product.","supporting_evidence":"Both parties attest these specific facts."})
RULING_KEYS=['decision','clause','damages_band','distance_ppm','policy_hash','terms_basis','facts','reason','damages_reason','evidence_refs']


def encoded(raw):
    import base64
    return base64.b64encode(raw).decode()


def panel(value):
    decision=value['decision']
    return {**value,'terms_basis':value.get('terms_basis','USE_TERMS'), 'facts':{'reproduction':'NO_COPYING' if decision=='NO_USE' else 'UNRESOLVED' if decision=='INSUFFICIENT_EVIDENCE' else 'COPYING',**{k:'ESTABLISHED' for k in ['actual_use','distribution','commercial_activity','competing_product','attribution']}},'reason':value.get('reason','The recorded condition was assessed against concrete copying in the source and output and the mutual commercial-use admissions.'),'damages_reason':'The established commercial copying supports this band.' if value['damages_band']!='NONE' else 'No prohibited use is established, so damages are zero.','evidence_refs':['SOURCE','OUTPUT','CLAIMANT','RESPONDENT','TERMS']}


def appeal(contract,vm,*args,**kwargs):
    # Older lifecycle tests answer the new review-evidence window explicitly.
    contract.appeal_claim(*args,**kwargs)
    claim=contract.get_claim(args[0]);prior=vm.sender
    from genlayer import Address
    other=claim['respondent'] if claim['appeals'][-1]['appealer']==claim['claimant'] else claim['claimant']
    vm.sender=Address(other)
    contract.respond_review(args[0],len(claim['appeals']),'The original factual evidence and admissions remain correct.')
    vm.sender=prior
