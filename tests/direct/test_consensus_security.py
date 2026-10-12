from conftest import fund
import json
import pytest
from conftest import URL, HASH
from test_desk import setup_desk, answer
from test_court import court, claim

@pytest.mark.parametrize('extra',[
    {'creator':'0x'+'f'*40}, {'holder':'0x'+'f'*40}, {'fee_atto':'200'},
    {'release_at':0}, {'terms_version':99}, {'intended_use':'Unrestricted use'},
    {'reason':'Unlimited commercial use is granted.'}, {'decision':True},
])
def test_desk_rejects_every_unbound_leader_field(direct_deploy,direct_vm,direct_bob,external_views,extra):
    work,_=external_views
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    answer(direct_vm)
    desk.request_licence(work['work_id'],'Commercial use with attribution.', expected_terms_version=1, expected_fee_atto='100')
    assert not direct_vm.run_validator(leader_result={'decision':'APPROVE','clause':'C2',**extra})


def test_desk_canonical_metadata_and_explanation_cannot_redirect_escrow(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,monkeypatch):
    work,_=external_views
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    answer(direct_vm)
    first=desk.request_licence(work['work_id'],'Commercial use with attribution.', expected_terms_version=1, expected_fee_atto='100')
    from genlayer import gl
    def hostile(assess,validator):
        result={**assess(),'creator':'0x'+direct_bob.hex(),'fee_atto':'200','release_at':0}
        assert not validator(gl.vm.Return(calldata=result))
        return result
    monkeypatch.setattr(gl.vm,'run_nondet_unsafe',hostile)
    fund(desk,direct_vm,100)
    with direct_vm.expect_revert('Unexpected consensus fields'):
        desk.request_licence(work['work_id'],'Another commercial use with attribution.', expected_terms_version=1, expected_fee_atto='100')
    assert desk.get_count()==1
    assert desk.get_licence(first)['creator']==work['creator']
    assert desk.get_account('0x'+direct_alice.hex())['escrow_atto']=='100'
    assert desk.get_account('0x'+direct_bob.hex())['credit_atto']=='100'


@pytest.mark.parametrize('extra',[{'reason':{'invalid':'text'}},{'reason':'A conflicting permission.'},{'distance_ppm':-1},{'distance_ppm':True},{'distance_ppm':4000001},{'policy_hash':'not-a-hash'},{'creator':'0x'+'f'*40}])
def test_court_rejects_malformed_and_unbound_leader_fields(direct_deploy,direct_vm,direct_alice,direct_bob,external_views,extra):
    work,_=external_views
    c=court(direct_deploy,direct_vm,direct_alice)
    key=claim(c,work,direct_bob)
    direct_vm.sender=direct_bob
    fund(c,direct_vm,100)
    c.respond(key, accepted_used_at=1767268800, accepted_terms_version=1)
    direct_vm.mock_llm(r'Tithe dispute panel.*',json.dumps({'decision':'USE','clause':'C2','damages_band':'LOW'}))
    ruling=c.rule(key)
    candidate={k:ruling[k] for k in ['decision','clause','damages_band','distance_ppm','policy_hash','terms_basis']}
    assert direct_vm.run_validator(leader_result=candidate)
    assert not direct_vm.run_validator(leader_result={**candidate,**extra})
    assert 'recorded condition' in ruling['reason']

@pytest.mark.parametrize('version,fee',[(0,''),(2,'100'),(1,'99'),(1,'1000')])
def test_stale_or_missing_fee_consent_cannot_create_licence(direct_deploy,direct_vm,direct_bob,external_views,version,fee):
    work,_=external_views
    desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    answer(direct_vm)
    with direct_vm.expect_revert('Terms or price changed'):
        desk.request_licence(work['work_id'],'Commercial use with attribution.','commercial',version,fee)
    assert desk.get_count()==0
    assert desk.get_account('0x'+direct_bob.hex())['credit_atto']=='100'


def test_explicit_operation_id_is_unique_and_returns_the_committed_licence(direct_deploy,direct_vm,direct_bob,external_views):
    import hashlib
    from genlayer import Address
    work,_=external_views;desk=setup_desk(direct_deploy,direct_vm,direct_bob);answer(direct_vm)
    request='operation-reference-1234'
    key=desk.request_licence(work['work_id'],'Commercial use with attribution.','commercial',1,'100',request)
    assert key==hashlib.sha256((Address(direct_bob).as_hex+':request:'+request).encode()).hexdigest()
    fund(desk,direct_vm,100)
    with direct_vm.expect_revert('already recorded'):
        desk.request_licence(work['work_id'],'Commercial use with attribution.','commercial',1,'100',request)
    assert desk.get_count()==1
    assert desk.get_account('0x'+direct_bob.hex())['escrow_atto']=='100'


def test_failed_model_keeps_the_exact_funded_fee_withdrawable(direct_deploy,direct_vm,direct_bob,external_views):
    work,_=external_views;desk=setup_desk(direct_deploy,direct_vm,direct_bob)
    direct_vm.mock_llm(r'.*','not JSON')
    with direct_vm.expect_revert('LLM_ERROR'):
        desk.request_licence(work['work_id'],'Commercial use with attribution.','commercial',1,'100')
    assert desk.get_account('0x'+direct_bob.hex())['credit_atto']=='100'
    assert desk.get_account('0x'+direct_bob.hex())['escrow_atto']=='0'
    assert desk.get_count()==0


def test_unavailable_output_keeps_initial_funding_as_credit(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c=court(direct_deploy,direct_vm,direct_alice)
    direct_vm.clear_mocks();direct_vm.mock_web(r'.*',{'status':404,'body':b''})
    with direct_vm.expect_revert('Artifact unavailable'):claim(c,work,direct_bob)
    assert c.get_account('0x'+direct_alice.hex())['credit_atto']=='100'
    assert c.get_account('0x'+direct_alice.hex())['escrow_atto']=='0'
    assert c.get_count()==0


def test_expired_appeal_does_not_consume_prepaid_credit(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c=court(direct_deploy,direct_vm,direct_alice);key=claim(c,work,direct_bob)
    direct_vm.sender=direct_bob;fund(c,direct_vm,100);c.respond(key,accepted_used_at=1767268800,accepted_terms_version=1)
    direct_vm.mock_llm(r'.*',json.dumps({'decision':'USE','clause':'C2','damages_band':'HIGH'}));c.rule(key)
    fund(c,direct_vm,200);direct_vm.warp('2026-01-04T12:00:00Z')
    with direct_vm.expect_revert('Appeal window closed'):c.appeal_claim(key,len(c.get_claim(key)['appeals'])+1,str(100*2**(len(c.get_claim(key)['appeals'])+1)))
    assert c.get_account('0x'+direct_bob.hex())['credit_atto']=='200'
    assert c.get_account('0x'+direct_bob.hex())['escrow_atto']=='200'
    assert len(c.get_claim(key)['appeals'])==0


def test_stale_review_quote_cannot_spend_a_larger_existing_credit(direct_deploy,direct_vm,direct_alice,direct_bob,external_views):
    work,_=external_views;c=court(direct_deploy,direct_vm,direct_alice);key=claim(c,work,direct_bob)
    direct_vm.sender=direct_bob;fund(c,direct_vm,100);c.respond(key,accepted_used_at=1767268800,accepted_terms_version=1)
    direct_vm.mock_llm(r'.*',json.dumps({'decision':'USE','clause':'C2','damages_band':'HIGH'}));c.rule(key)
    fund(c,direct_vm,1000);c.appeal_claim(key,1,'200');c.rule(key)
    before=c.get_account('0x'+direct_bob.hex())['credit_atto']
    with direct_vm.expect_revert('Review round or bond changed'):c.appeal_claim(key,1,'200')
    assert c.get_account('0x'+direct_bob.hex())['credit_atto']==before=='800'
    assert len(c.get_claim(key)['appeals'])==1
    c.appeal_claim(key,2,'400')
    assert c.get_account('0x'+direct_bob.hex())['credit_atto']=='400'
