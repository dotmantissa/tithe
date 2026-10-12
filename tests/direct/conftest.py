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
    work_id = registry.register_work(URL, HASH, TERMS, PRICES, 'commercial', 'The orchard')
    work = registry.get_work(work_id)
    historic = registry.get_terms_at(work_id, 1767268800)
    from genlayer import gl
    licence_box = {}
    view = SimpleNamespace(get_work=lambda _: work, get_terms=lambda *args: work['terms'], get_terms_at=lambda *args: {"version": args[2] if len(args) > 2 and args[2] else historic["version"], "terms": work["terms"]}, get_licence=lambda key: licence_box[key])
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
