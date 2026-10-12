import hashlib
import json
import sys
import pytest
from conftest import SOURCE, URL, HASH, TERMS, PRICES, USAGE, encoded, fund, panel, RULING_KEYS
from test_court import court, claim
from test_desk import setup_desk, answer


def ready(direct_deploy,vm,alice,bob,work):
    c=court(direct_deploy,vm,alice);key=claim(c,work,bob)
    vm.sender=bob;fund(c,vm,100)
    c.respond(key,accepted_used_at=1767268800,accepted_terms_version=1,usage_json=USAGE)
    return c,key


def mock_ruling(vm,decision='USE',band='HIGH',supported=True):
    vm.mock_llm(r'Tithe reasoning verification.*',json.dumps({'supported':supported}))
    vm.mock_llm(r'Tithe dispute panel.*',json.dumps(panel({'decision':decision,'clause':'C2','damages_band':band})))


def test_registration_preserves_hash_verified_bytes_without_network(direct_deploy,direct_vm,direct_alice,monkeypatch):
    c=direct_deploy('contracts/work_registry.py');direct_vm.sender=direct_alice
    from genlayer import gl
    monkeypatch.setattr(gl.nondet.web,'get',lambda *a,**k:pytest.fail('No contract may fetch a caller URL'))
    key=c.register_work(URL,HASH,TERMS,PRICES,'commercial',artifact_base64=encoded(SOURCE))
    assert c.get_artifact(key)==encoded(SOURCE)
    c.update_terms(key,'Commercial use is prohibited.',PRICES,'commercial')
    assert c.get_artifact(key)==encoded(SOURCE)
    assert c.lookup_work('missing')=={'found':False}
    assert c.lookup_terms(key,129)=={'found':False}


@pytest.mark.parametrize('raw,expected',[('', 'Commit artifact bytes'),('%%%', 'Invalid artifact encoding'),(encoded(b'other'), 'Content hash changed'),('A'*2666672, 'Commit artifact bytes')])
def test_direct_registration_requires_bounded_committed_evidence(direct_deploy,direct_vm,raw,expected):
    c=direct_deploy('contracts/work_registry.py')
    with direct_vm.expect_revert(expected):c.register_work(URL,HASH,TERMS,PRICES,'commercial',artifact_base64=raw)
    assert c.get_count()==0


def test_withdrawn_artifacts_cannot_interrupt_initial_hearing_or_review(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,monkeypatch):
    work,_=external_views;c,key=ready(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    from genlayer import gl,Address
    monkeypatch.setattr(gl.nondet.web,'get',lambda *a,**k:pytest.fail('Evidence must use preserved bytes'))
    mock_ruling(direct_vm);first=c.rule(key);assert direct_vm.run_validator()
    fund(c,direct_vm,200);c.appeal_claim(key,1,'200','The commercial use finding needs a fresh assessment.','Committed additional document excerpt, still only an allegation.')
    direct_vm.sender=direct_alice;c.respond_review(key,1,'I confirm the original evidence and mutual commercial admissions.')
    second=c.rule(key);assert direct_vm.run_validator()
    assert second==first and c.get_output(key)==encoded(SOURCE)
    record=c.get_claim(key)
    assert record['claimant_usage']==record['respondent_usage']==json.loads(USAGE)
    assert hashlib.sha256(json.dumps(record['claimant_usage'],sort_keys=True).encode()).hexdigest()==record['claimant_usage_hash']


@pytest.mark.parametrize('bad',['', '{}', json.dumps({**json.loads(USAGE),'actual_use':''}),json.dumps({**json.loads(USAGE),'extra':'instructions'})])
def test_missing_usage_evidence_cannot_consume_claim_credit(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,bad):
    work,_=external_views;c=court(direct_deploy,direct_vm,direct_alice)
    with direct_vm.expect_revert('EXPECTED'):c.file_claim(work['work_id'],URL,HASH,'0x'+direct_bob.hex(),1767268800,1,output_base64=encoded(SOURCE),usage_json=bad)
    assert c.get_count()==0 and c.get_account('0x'+direct_alice.hex())['credit_atto']=='100'


def test_insufficient_evidence_returns_both_bonds_and_review_bond(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c,key=ready(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    mock_ruling(direct_vm);c.rule(key);fund(c,direct_vm,200)
    c.appeal_claim(key,1,'200','The evidence does not establish actual commercial activity.')
    direct_vm.sender=direct_alice;c.respond_review(key,1,'The commercial allegation cannot be independently established.')
    direct_vm.clear_mocks();mock_ruling(direct_vm,'INSUFFICIENT_EVIDENCE','NONE')
    result=c.rule(key);assert direct_vm.run_validator();assert result['damages_band']=='NONE'
    direct_vm.warp('2026-01-04T12:00:00Z');c.settle(key)
    assert c.get_account('0x'+direct_alice.hex())['credit_atto']=='100'
    assert c.get_account('0x'+direct_bob.hex())['credit_atto']=='300'
    assert c.get_account('0x'+direct_bob.hex())['escrow_atto']=='0'


@pytest.mark.parametrize('field,value',[('actual_use','UNRESOLVED'),('commercial_activity','NOT_RELEVANT')])
def test_prohibited_high_award_requires_resolved_material_and_commercial_facts(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,field,value):
    work,_=external_views;c,key=ready(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    ruling=panel({'decision':'USE','clause':'C2','damages_band':'HIGH'});ruling['facts'][field]=value
    direct_vm.mock_llm(r'Tithe dispute panel.*',json.dumps(ruling))
    with direct_vm.expect_revert('Invalid damages or factual ruling'):c.rule(key)
    assert c.get_claim(key)['status']=='READY'
    assert c.get_account('0x'+direct_bob.hex())['escrow_atto']=='200'


def test_matching_verdict_cannot_smuggle_unsupported_factual_reasoning(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c,key=ready(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    mock_ruling(direct_vm,supported=False);ruling=c.rule(key)
    candidate={k:ruling[k] for k in RULING_KEYS};candidate['reason']='The respondent admits selling one million copies, although no such admission exists in any committed evidence.'
    assert not direct_vm.run_validator(leader_result=candidate)
    candidate['evidence_refs']=['SOURCE',{}]
    assert not sys.modules[c.__module__].valid_ruling(candidate)


def test_review_ground_commitment_and_opposing_window(direct_deploy,direct_vm,direct_alice,direct_bob,direct_charlie,external_views):
    work,_=external_views;c,key=ready(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    mock_ruling(direct_vm);c.rule(key);fund(c,direct_vm,200)
    with direct_vm.expect_revert('Explain the review grounds'):c.appeal_claim(key,1,'200')
    c.appeal_claim(key,1,'200','The attribution finding overlooks the submitted credit.','A preserved excerpt of the product credits.')
    with direct_vm.expect_revert('Allow the other party'):c.rule(key)
    with direct_vm.expect_revert('Only the other party'):c.respond_review(key,1,'I cannot answer my own review as the opposing party.')
    direct_vm.sender=direct_charlie
    with direct_vm.expect_revert('Only the other party'):c.respond_review(key,1,'A stranger cannot answer the review evidence.')
    direct_vm.sender=direct_alice;c.respond_review(key,1,'The supplied product credits do indeed identify this creator.')
    with direct_vm.expect_revert('Review response window closed'):c.respond_review(key,1,'A later replacement response cannot overwrite the first.')
    c.rule(key);review=c.get_claim(key)['appeals'][0]
    assert review['additional_evidence']=='A preserved excerpt of the product credits.'
    assert review['outcome']=='REVIEWED' and review['response_at']>0


def test_review_can_proceed_after_unanswered_response_window(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c,key=ready(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    mock_ruling(direct_vm);c.rule(key);fund(c,direct_vm,200);c.appeal_claim(key,1,'200','The clause chosen deserves another independent reading.')
    direct_vm.warp('2026-01-01T18:00:01Z');c.rule(key)
    assert c.get_claim(key)['appeals'][0]['outcome']=='REVIEWED'


def test_duplicate_clauses_are_rejected_and_old_equivalents_map_to_first(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;work['terms']['clauses']=['C1: Commercial use is allowed.','C2: Commercial use is allowed.']
    c=setup_desk(direct_deploy,direct_vm,direct_bob);answer(direct_vm,clause='C2')
    key=c.request_licence(work['work_id'],'Commercial use with attribution.','commercial',1,'100')
    assert c.get_licence(key)['clause']=='C1'
    assert direct_vm.run_validator(leader_result={'decision':'APPROVE','clause':'C1'})


def test_terms_lifetime_boundary_and_duplicate_normalization(direct_deploy,direct_vm,direct_alice):
    c=direct_deploy('contracts/work_registry.py');direct_vm.sender=direct_alice
    with direct_vm.expect_revert('Duplicate clauses'):c.register_work(URL,HASH,'Research is permitted.\nresearch   IS permitted.',PRICES,'commercial',artifact_base64=encoded(SOURCE))
    key=c.register_work(URL,HASH,TERMS,PRICES,'commercial',artifact_base64=encoded(SOURCE))
    for _ in range(127):c.update_terms(key,TERMS,PRICES,'commercial')
    record=c.get_work(key);assert record['version']==record['terms_version_limit']==128
    with direct_vm.expect_revert('Terms version limit'):c.update_terms(key,TERMS,PRICES,'commercial')


def test_no_copy_normalizes_irrelevant_context_and_clause_choices(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c,key=ready(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    mock_ruling(direct_vm,'NO_USE','NONE');result=c.rule(key)
    assert result['clause']=='C1' and all(v=='NOT_RELEVANT' for k,v in result['facts'].items() if k!='reproduction')
    direct_vm.clear_mocks()
    independent=panel({'decision':'NO_USE','clause':'C1','damages_band':'NONE'})
    independent['facts'].update({k:'UNRESOLVED' for k in independent['facts'] if k!='reproduction'})
    direct_vm.mock_llm(r'Tithe dispute panel.*',json.dumps(independent))
    direct_vm.mock_llm(r'Tithe reasoning verification.*','{"supported":true}')
    assert direct_vm.run_validator(leader_result={k:result[k] for k in RULING_KEYS})
