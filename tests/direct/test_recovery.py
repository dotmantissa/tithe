from conftest import fund
import hashlib
import json
import pytest
from conftest import SOURCE,URL,HASH,TERMS,PRICES
from test_court import court,claim


def prepared(direct_deploy,direct_vm,direct_alice,direct_bob,work):
    c=court(direct_deploy,direct_vm,direct_alice)
    key=claim(c,work,direct_bob)
    direct_vm.sender=direct_bob
    return c,key


def respond(c,key,vm):fund(c,vm,100);c.respond(key,accepted_used_at=1767268800,accepted_terms_version=1)


def verdict(direct_vm,decision='USE',band='HIGH',basis='USE_TERMS'):
    direct_vm.mock_llm(r'Tithe dispute panel.*',json.dumps({'decision':decision,'clause':'C2','damages_band':band,'terms_basis':basis}))


def test_initial_hearing_failure_has_bounded_equal_refunds(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c,key=prepared(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    respond(c,key,direct_vm)
    direct_vm.clear_mocks();direct_vm.mock_web(r'.*',{'status':404,'body':b''})
    with direct_vm.expect_revert('Artifact unavailable'):c.rule(key)
    with direct_vm.expect_revert('deadline has not passed'):c.recover_hearing(key)
    direct_vm.warp('2026-01-03T12:00:00Z');c.recover_hearing(key)
    assert c.get_claim(key)['status']=='CLOSED_WITHOUT_RULING'
    assert 'ruling' not in c.get_claim(key)
    assert c.get_account('0x'+direct_alice.hex())['credit_atto']=='100'
    assert c.get_account('0x'+direct_bob.hex())['credit_atto']=='100'
    assert c.get_account('0x'+direct_bob.hex())['escrow_atto']=='0'
    with direct_vm.expect_revert('deadline has not passed'):c.recover_hearing(key)


def test_failed_review_preserves_ruling_and_returns_only_review_bond(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c,key=prepared(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    respond(c,key,direct_vm);verdict(direct_vm);original=c.rule(key)
    fund(c,direct_vm,200);c.appeal_claim(key)
    assert c.get_claim(key)['status']=='REVIEW_PENDING'
    direct_vm.clear_mocks();direct_vm.mock_web(r'.*',{'status':404,'body':b''})
    with direct_vm.expect_revert('Artifact unavailable'):c.rule(key)
    direct_vm.warp('2026-01-02T12:01:00Z');c.recover_hearing(key)
    record=c.get_claim(key)
    assert record['status']=='RULED' and record['ruling']==original
    assert record['appeals'][0]['outcome']=='EXPIRED'
    assert c.get_account('0x'+direct_bob.hex())['credit_atto']=='200'
    assert c.get_account('0x'+direct_bob.hex())['escrow_atto']=='200'
    with direct_vm.expect_revert('open to network appeal'):c.settle(key)
    direct_vm.warp('2026-01-04T12:00:00Z');c.settle(key)
    assert c.get_account('0x'+direct_alice.hex())['credit_atto']=='200'
    assert c.get_account('0x'+direct_bob.hex())['credit_atto']=='200'
    assert c.get_account('0x'+direct_bob.hex())['escrow_atto']=='0'


def test_no_response_bond_without_explicit_time_agreement(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c,key=prepared(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    fund(c,direct_vm,100)
    with direct_vm.expect_revert('Confirm the proposed use time'):c.respond(key)
    with direct_vm.expect_revert('Confirm the proposed use time'):c.respond(key,accepted_used_at=1767268801,accepted_terms_version=1)
    assert c.get_claim(key)['status']=='AWAITING_RESPONSE'
    assert c.get_account('0x'+direct_bob.hex())['escrow_atto']=='100'


def test_corrected_time_needs_other_party_acceptance_and_exact_version(direct_deploy,direct_vm,direct_alice,direct_bob,direct_charlie,external_views):
    work,_=external_views;c,key=prepared(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    direct_vm.warp('2026-01-01T12:00:02Z')
    c.propose_use_time(key,1767268801,1)
    with direct_vm.expect_revert('other party'):c.accept_use_time(key,1767268801,1)
    direct_vm.sender=direct_charlie
    with direct_vm.expect_revert('other party'):c.accept_use_time(key,1767268801,1)
    direct_vm.sender=direct_alice
    with direct_vm.expect_revert('changed'):c.accept_use_time(key,1767268800,1)
    c.accept_use_time(key,1767268801,1)
    direct_vm.sender=direct_bob;fund(c,direct_vm,100);c.respond(key,accepted_used_at=1767268801,accepted_terms_version=1)
    assert c.get_claim(key)['time_agreed'] is True
    assert c.get_claim(key)['used_at']==1767268801


def test_unresolved_time_disagreement_closes_without_assumed_guilt(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c,key=prepared(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    c.propose_use_time(key,1767268800,1)
    direct_vm.warp('2026-01-09T12:00:00Z');c.cancel_unanswered(key)
    assert c.get_claim(key)['status']=='CLOSED_WITHOUT_RULING'
    assert c.get_account('0x'+direct_alice.hex())['credit_atto']=='100'


def test_policy_is_claim_bound_and_immutable_through_review(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c,key=prepared(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    url='https://policy.example.org/policy.txt'
    raw=('Research use is our policy.\nTithe policy binding: '+key+':0x'+direct_bob.hex()).encode()
    fingerprint=hashlib.sha256(raw).hexdigest()
    direct_vm.mock_web(r'https://policy.example.org/.*',{'status':200,'body':raw})
    fund(c,direct_vm,100)
    c.respond(key,url,'',1767268800,1,fingerprint)
    verdict(direct_vm);first=c.rule(key)
    fund(c,direct_vm,200);c.appeal_claim(key)
    direct_vm.clear_mocks()
    direct_vm.mock_web(r'https://example.org/.*',{'status':200,'body':SOURCE})
    direct_vm.mock_web(r'https://policy.example.org/.*',{'status':404,'body':b''})
    verdict(direct_vm);second=c.rule(key)
    assert direct_vm.run_validator()
    assert first['policy_hash']==second['policy_hash']==fingerprint
    assert c.get_claim(key)['policy_text']==raw.decode()


def test_unbound_policy_cannot_lock_a_response_bond(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c,key=prepared(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    raw=b'This page does not bind the claim and account.'
    direct_vm.mock_web(r'https://policy.example.org/.*',{'status':200,'body':raw})
    with direct_vm.expect_revert('Publish the claim and account binding'):
        fund(c,direct_vm,100)
        c.respond(key,'https://policy.example.org/policy.txt','',1767268800,1,hashlib.sha256(raw).hexdigest())
    assert c.get_claim(key)['status']=='AWAITING_RESPONSE'
    assert c.get_account('0x'+direct_bob.hex())['escrow_atto']=='100'


def test_prior_grant_is_assessed_under_its_original_terms(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,monkeypatch):
    work,licences=external_views;work['version']=2
    from genlayer import gl
    from types import SimpleNamespace
    old=work['terms'];new={**old,'terms_text':'Commercial use is now prohibited.','clauses':['C1: Commercial use is now prohibited.']}
    view=SimpleNamespace(get_work=lambda _:work,get_terms=lambda _,v:old if v==1 else new,get_terms_at=lambda *args:{'version':2,'terms':new},get_licence=lambda key:licences[key])
    monkeypatch.setattr(gl,'get_contract_at',lambda _:SimpleNamespace(view=lambda:view))
    c=court(direct_deploy,direct_vm,direct_alice)
    key=c.file_claim(work['work_id'],URL,HASH,'0x'+direct_bob.hex(),1767268800,2)
    licences['prior']={'decision':'APPROVE','holder':'0x'+direct_bob.hex(),'work_id':work['work_id'],'issued_at':1767268700,'terms_version':1,'use_class':'commercial','intended_use':'Commercial use with attribution.','clause':'C2','fee_atto':'100','reason':'Ignored non-authoritative old prose.'}
    direct_vm.sender=direct_bob;fund(c,direct_vm,100);c.respond(key,'','prior',1767268800,2,'')
    verdict(direct_vm,'DERIVATIVE_WITHIN_TERMS','NONE','LICENCE_TERMS');ruling=c.rule(key)
    assert direct_vm.run_validator()
    assert ruling['terms_version']==1 and ruling['terms_basis']=='LICENCE_TERMS'
    proposed={k:ruling[k] for k in ['decision','clause','damages_band','distance_ppm','policy_hash','terms_basis']}
    assert not direct_vm.run_validator(leader_result={**proposed,'terms_basis':'USE_TERMS'})


def test_all_three_bonded_rounds_conserve_funds_and_enforce_limit(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c,key=prepared(direct_deploy,direct_vm,direct_alice,direct_bob,work)
    respond(c,key,direct_vm);verdict(direct_vm);c.rule(key)
    for bond in [200,400,800]:
        fund(c,direct_vm,bond);c.appeal_claim(key);c.rule(key)
    direct_vm.value=1600
    with direct_vm.expect_revert('Maximum appeal'):c.appeal_claim(key)
    assert c.get_account('0x'+direct_bob.hex())['escrow_atto']=='1600'
    direct_vm.warp('2026-01-04T12:00:00Z');c.settle(key)
    assert c.get_account('0x'+direct_alice.hex())['credit_atto']=='1600'
    assert c.get_account('0x'+direct_bob.hex())['credit_atto']=='0'
    assert c.get_account('0x'+direct_bob.hex())['escrow_atto']=='0'
